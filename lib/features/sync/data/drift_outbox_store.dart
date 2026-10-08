import 'dart:convert';

import 'package:drift/drift.dart';
// The remote protocol is experimental; its public error API and matching worker
// version are pinned and verified by native and actual browser tests.
// ignore: experimental_member_use
import 'package:drift/remote.dart' show DriftRemoteException;
import 'package:sqlite3/common.dart' show SqliteException;

import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/data_page.dart';
import '../../../shared/domain/financial_failure.dart';
import '../domain/frozen_command.dart';
import '../domain/outbox_entry.dart';
import '../domain/outbox_store.dart';
import '../domain/sync_capability.dart';
import 'local_outbox_failure.dart';
import 'outbox_database.dart';
import 'outbox_location.dart';

const _unresolved = ['queued', 'sending', 'rejected', 'blocked'];
const _review = FinancialFailure(
  FinancialFailureCode.recovery,
  'An earlier action needs review. Your change is preserved.',
);

FinancialFailure _safeFailure(FinancialFailureCode code, [int? remaining]) =>
    FinancialFailure(code, switch (code) {
      FinancialFailureCode.conflict =>
        'This record changed. Refresh it before saving again.',
      FinancialFailureCode.overpayment =>
        'This payment exceeds the remaining balance. Review the amount.',
      FinancialFailureCode.offline =>
        'Waiting for a connection. Your change is saved on this device.',
      FinancialFailureCode.signIn =>
        'Sign in to the same account to sync this change.',
      FinancialFailureCode.invalid =>
        'Check the amount, dates and selected details.',
      FinancialFailureCode.recovery =>
        'This action needs review. Your change is preserved.',
      FinancialFailureCode.unavailable =>
        'Could not confirm this change. Retry after reconnecting.',
    }, remainingMinor: remaining);

final class _OutboxCursor implements PageCursor {
  const _OutboxCursor(this.scope, this.before);
  final String scope;
  final int before;
}

/// One local owner scope, with every financial transition committed atomically.
final class DriftOutboxStore implements OutboxStore {
  DriftOutboxStore._(this.database, this.owner, this.environmentKey);
  final OutboxDatabase database;
  @override
  final OwnerUid owner;
  final String environmentKey;
  bool _closed = false;
  Future<void>? _closing;
  String get _scopeKey => outboxDatabaseName(owner, environmentKey);

  static Future<DriftOutboxStore> open(
    OutboxDatabase database, {
    required OwnerUid owner,
    required String environmentKey,
  }) async {
    outboxDatabaseName(owner, environmentKey);
    final store = DriftOutboxStore._(database, owner, environmentKey);
    try {
      await database.transaction(() async {
        // Acquire SQLite's writer before reading ownership or lease state.
        await database.customStatement(
          'UPDATE outbox_scopes SET id = id WHERE id = 1',
        );
        final rows = await database.select(database.outboxScopes).get();
        if (rows.isEmpty) {
          await database
              .into(database.outboxScopes)
              .insert(
                OutboxScopesCompanion.insert(
                  id: const Value(1),
                  userId: owner.value,
                  environmentKey: environmentKey,
                ),
              );
        } else if (rows.length != 1 ||
            rows.single.id != 1 ||
            rows.single.userId != owner.value ||
            rows.single.environmentKey != environmentKey) {
          throw const LocalOutboxFailure(SyncAvailability.unsupportedSchema);
        }
      });
      return store;
    } catch (error) {
      await database.close();
      if (database.rejectedSchema) {
        throw const LocalOutboxFailure(SyncAvailability.unsupportedSchema);
      }
      throw _localFailure(error);
    }
  }

  static LocalOutboxFailure _localFailure(Object error) {
    for (var depth = 0; depth < 4 && error is DriftRemoteException; depth++) {
      error = error.remoteCause;
    }
    if (error is LocalOutboxFailure) return error;
    // SQLITE_FULL is stable across native and WASM implementations.
    if (error is SqliteException && error.resultCode == 13) {
      return const LocalOutboxFailure(SyncAvailability.quota);
    }
    return const LocalOutboxFailure(SyncAvailability.unavailable);
  }

  void _check() {
    if (_closed) throw const LocalOutboxFailure(SyncAvailability.unavailable);
  }

  Future<T> _read<T>(Future<T> Function() operation) async {
    _check();
    try {
      final result = await operation();
      _check();
      return result;
    } on FinancialFailure {
      rethrow;
    } on ArgumentError {
      rethrow;
    } catch (error) {
      throw _localFailure(error);
    }
  }

  Future<T> _atomic<T>(Future<T> Function() operation) => _read(
    () => database.transaction(() async {
      await database.customStatement(
        'UPDATE outbox_scopes SET id = id WHERE id = 1',
      );
      return operation();
    }),
  );

  Selectable<StoredCommand> _row(CommandId id) => database.select(
    database.commandRows,
  )..where((t) => t.userId.equals(owner.value) & t.commandId.equals(id.value));
  Future<OutboxEntry?> _get(CommandId id) async {
    final row = await _row(id).getSingleOrNull();
    return row == null ? null : _decode(row);
  }

  @override
  Future<OutboxEntry?> get(CommandId id) => _read(() => _get(id));

  OutboxEntry _decode(StoredCommand row) {
    try {
      if (row.userId != owner.value ||
          row.commandJson.length > maxCommandBytes * 2 + 8192 ||
          row.resultJson != null && row.resultJson!.length > maxCommandBytes) {
        throw const FormatException();
      }
      final command = FrozenCommand.fromStored(
        Map<String, Object?>.from(jsonDecode(row.commandJson) as Map),
        expectedOwner: owner,
      );
      if (row.commandId != command.id.value ||
          row.resourceKey != command.resourceKey ||
          row.rowGeneration < 0 ||
          row.rowGeneration >= maxExactCommandInteger) {
        throw const FormatException();
      }
      final state = OutboxState.parse(row.state);
      CommandLease? lease;
      if (state == OutboxState.sending) {
        lease = CommandLease(
          id: command.id,
          generation: row.rowGeneration,
          dispatch: DispatchLease(
            owner: owner,
            token: row.dispatchToken!,
            generation: row.dispatchGeneration!,
            expiresAt: _date(row.dispatchExpiresAt!),
          ),
        );
      } else if (row.dispatchToken != null ||
          row.dispatchGeneration != null ||
          row.dispatchExpiresAt != null) {
        throw const FormatException();
      }
      FinancialFailure? failure;
      if (row.failureCode != null) {
        final code = FinancialFailureCode.values.firstWhere(
          (c) => c.name == row.failureCode,
        );
        if (row.failureRemaining != null &&
            (row.failureRemaining! < 0 ||
                row.failureRemaining! > maxExactCommandInteger)) {
          throw const FormatException();
        }
        failure = _safeFailure(code, row.failureRemaining);
      } else if (row.failureRemaining != null) {
        throw const FormatException();
      }
      return OutboxEntry(
        command: command,
        sequence: row.sequence,
        revision: row.revision,
        state: state,
        attempts: row.attempts,
        nextAttemptAt: _date(row.nextAttemptAt),
        updatedAt: _date(row.updatedAt),
        lease: lease,
        failure: failure,
        result: row.resultJson == null
            ? null
            : Map<String, Object?>.from(jsonDecode(row.resultJson!) as Map),
      );
    } catch (_) {
      throw const LocalOutboxFailure(SyncAvailability.unsupportedSchema);
    }
  }

  static int _time(DateTime instant) {
    if (!instant.isUtc ||
        instant.millisecondsSinceEpoch.abs() > maxExactCommandInteger) {
      throw ArgumentError('Use a valid UTC instant.');
    }
    return instant.millisecondsSinceEpoch;
  }

  static DateTime _date(int millis) {
    if (millis.abs() > maxExactCommandInteger) {
      throw const FormatException();
    }
    return DateTime.fromMillisecondsSinceEpoch(millis, isUtc: true);
  }

  @override
  Future<OutboxEntry> enqueue(FrozenCommand command) => _atomic(() async {
    if (command.owner != owner) {
      throw _safeFailure(FinancialFailureCode.signIn);
    }
    final existing = await _get(command.id);
    if (existing != null) {
      if (!existing.command.sameIdentity(command)) {
        throw _safeFailure(FinancialFailureCode.conflict);
      }
      return existing;
    }
    final count = await database
        .customSelect(
          'SELECT COUNT(*) AS n FROM command_rows WHERE user_id = ? AND state IN (?, ?, ?, ?)',
          variables: [Variable(owner.value), ..._unresolved.map(Variable.new)],
        )
        .getSingle();
    if (count.read<int>('n') >= 1000) {
      throw const LocalOutboxFailure(SyncAvailability.quota);
    }
    final visiting = <String>{command.id.value};
    final depths = <String, int>{};
    Future<int> depth(CommandId id) async {
      if (visiting.contains(id.value) || depths.length > 1000) {
        throw _safeFailure(FinancialFailureCode.invalid);
      }
      if (depths[id.value] case final int value) {
        return value;
      }
      final parent = await _get(id);
      if (parent == null) {
        throw _safeFailure(FinancialFailureCode.invalid);
      }
      visiting.add(id.value);
      if (visiting.length > 18) {
        throw _safeFailure(FinancialFailureCode.invalid);
      }
      var maximum = 0;
      for (final dependency in parent.command.dependencies) {
        final value = await depth(dependency.id) + 1;
        if (value > maximum) {
          maximum = value;
        }
      }
      visiting.remove(id.value);
      depths[id.value] = maximum;
      return maximum;
    }

    for (final parent in command.dependencies) {
      if (await depth(parent.id) >= 16) {
        throw _safeFailure(FinancialFailureCode.invalid);
      }
    }
    final time = _time(command.createdAt);
    await database
        .into(database.commandRows)
        .insert(
          CommandRowsCompanion.insert(
            userId: owner.value,
            commandId: command.id.value,
            commandJson: jsonEncode(command.toStored()),
            resourceKey: command.resourceKey,
            state: 'queued',
            revision: 1,
            attempts: 0,
            nextAttemptAt: time,
            updatedAt: time,
          ),
        );
    return (await _get(command.id))!;
  });

  int _limit(int limit) {
    if (limit < 1 || limit > 1000) {
      throw ArgumentError('Use a page size from 1 to 1000.');
    }
    return limit;
  }

  SimpleSelectStatement<$CommandRowsTable, StoredCommand> _pageQuery(
    int limit, [
    PageCursor? cursor,
  ]) {
    _limit(limit);
    if (cursor != null &&
        (cursor is! _OutboxCursor || cursor.scope != _scopeKey)) {
      throw _safeFailure(FinancialFailureCode.invalid);
    }
    final query = database.select(database.commandRows)
      ..where((t) => t.userId.equals(owner.value));
    if (cursor is _OutboxCursor) {
      query.where((t) => t.sequence.isSmallerThanValue(cursor.before));
    }
    return query
      ..orderBy([(t) => OrderingTerm.desc(t.sequence)])
      ..limit(limit + 1);
  }

  DataPage<OutboxEntry> _page(List<StoredCommand> rows, int limit) => DataPage(
    items: rows.take(limit).map(_decode),
    nextCursor: rows.length > limit
        ? _OutboxCursor(_scopeKey, rows[limit - 1].sequence)
        : null,
    hasMore: rows.length > limit,
    isFromCache: true,
  );
  @override
  Future<DataPage<OutboxEntry>> getPage({PageCursor? after, int limit = 100}) =>
      _read(() async => _page(await _pageQuery(limit, after).get(), limit));
  @override
  Stream<DataPage<OutboxEntry>> watch({int limit = 100}) async* {
    _check();
    try {
      await for (final rows in _pageQuery(limit).watch()) {
        if (_closed) return;
        yield _page(rows, limit);
      }
    } catch (error) {
      if (!_closed) {
        yield* Stream.error(
          error is FinancialFailure || error is ArgumentError
              ? error
              : _localFailure(error),
        );
      }
    }
  }

  Future<StoredScope> _scope() async {
    final scope = await (database.select(
      database.outboxScopes,
    )..where((t) => t.id.equals(1))).getSingle();
    if (scope.userId != owner.value ||
        scope.environmentKey != environmentKey ||
        scope.dispatchGeneration < 0 ||
        scope.dispatchGeneration >= maxExactCommandInteger) {
      throw const LocalOutboxFailure(SyncAvailability.unsupportedSchema);
    }
    return scope;
  }

  Future<void> _writeScope(OutboxScopesCompanion value) => (database.update(
    database.outboxScopes,
  )..where((t) => t.id.equals(1))).write(value);
  Future<StoredScope> _observe(DateTime now) async {
    final time = _time(now), scope = await _scope();
    final backwards = scope.clockSeenAt != null && time < scope.clockSeenAt!;
    if (backwards && scope.dispatchToken != null) {
      await _writeScope(
        OutboxScopesCompanion(
          dispatchGeneration: Value(scope.dispatchGeneration + 1),
          dispatchToken: const Value(null),
          dispatchExpiresAt: const Value(null),
          clockSeenAt: Value(time),
        ),
      );
    } else {
      await _writeScope(OutboxScopesCompanion(clockSeenAt: Value(time)));
    }
    return _scope();
  }

  bool _matches(StoredScope scope, DispatchLease lease, DateTime now) =>
      lease.owner == owner &&
      lease.isValidAt(now) &&
      scope.dispatchToken == lease.token &&
      scope.dispatchGeneration == lease.generation &&
      scope.dispatchExpiresAt == _time(lease.expiresAt);
  @override
  Future<DispatchLease?> claimDispatch(DateTime now, {required String token}) =>
      _atomic(() async {
        final scope = await _observe(now), time = _time(now);
        if (scope.dispatchToken != null &&
            scope.dispatchExpiresAt != null &&
            scope.dispatchExpiresAt! > time &&
            scope.dispatchExpiresAt! - time <= 60000) {
          return null;
        }
        final lease = DispatchLease(
          owner: owner,
          token: token,
          generation: scope.dispatchGeneration + 1,
          expiresAt: _date(_time(now.add(const Duration(seconds: 60)))),
        );
        await _writeScope(
          OutboxScopesCompanion(
            dispatchGeneration: Value(lease.generation),
            dispatchToken: Value(token),
            dispatchExpiresAt: Value(_time(lease.expiresAt)),
          ),
        );
        return lease;
      });

  @override
  Future<LeasedCommand?> claimNext(
    DispatchLease dispatch,
    DateTime now,
  ) => _atomic(() async {
    if (dispatch.owner != owner) {
      return null;
    }
    final scope = await _observe(now);
    if (!_matches(scope, dispatch, now)) {
      return null;
    }
    final rows =
        await (database.select(database.commandRows)
              ..where(
                (t) => t.userId.equals(owner.value) & t.state.isIn(_unresolved),
              )
              ..orderBy([(t) => OrderingTerm.asc(t.sequence)])
              ..limit(1001))
            .get();
    if (rows.length > 1000) {
      throw const LocalOutboxFailure(SyncAvailability.unsupportedSchema);
    }
    final entries = rows.map(_decode).toList();
    final held = <String>{};
    LeasedCommand? selected;
    for (final entry in entries) {
      if (entry.state == OutboxState.rejected) {
        continue;
      }
      if (entry.state == OutboxState.blocked) {
        held.add(entry.command.resourceKey);
        continue;
      }
      var pending = false, blocked = false;
      for (final dependency in entry.command.dependencies) {
        final parent = await _get(dependency.id);
        if (parent == null) {
          throw const LocalOutboxFailure(SyncAvailability.unsupportedSchema);
        }
        if ([
          OutboxState.rejected,
          OutboxState.blocked,
          OutboxState.cancelled,
        ].contains(parent.state)) {
          blocked = true;
        }
        if (parent.state != OutboxState.accepted) {
          pending = true;
        }
      }
      if (blocked) {
        await _write(
          entry.command.id,
          _transition(entry, OutboxState.blocked, now, failure: _review),
        );
        held.add(entry.command.resourceKey);
        continue;
      }
      final resourceHeld = held.contains(entry.command.resourceKey);
      held.add(entry.command.resourceKey);
      final liveSending =
          entry.lease != null && entry.lease!.dispatch.sameFence(dispatch);
      if (selected != null ||
          pending ||
          resourceHeld ||
          liveSending ||
          entry.state == OutboxState.queued &&
              entry.nextAttemptAt.isAfter(now)) {
        continue;
      }
      final generation =
          rows
              .firstWhere((row) => row.commandId == entry.command.id.value)
              .rowGeneration +
          1;
      await _write(
        entry.command.id,
        CommandRowsCompanion(
          state: const Value('sending'),
          attempts: Value(entry.attempts + 1),
          revision: Value(entry.revision + 1),
          updatedAt: Value(_time(now)),
          rowGeneration: Value(generation),
          dispatchToken: Value(dispatch.token),
          dispatchGeneration: Value(dispatch.generation),
          dispatchExpiresAt: Value(_time(dispatch.expiresAt)),
          failureCode: const Value(null),
          failureRemaining: const Value(null),
        ),
      );
      selected = LeasedCommand((await _get(entry.command.id))!, dispatch);
    }
    return selected;
  });
  Future<void> _write(CommandId id, CommandRowsCompanion value) async {
    await (database.update(database.commandRows)..where(
          (t) => t.userId.equals(owner.value) & t.commandId.equals(id.value),
        ))
        .write(value);
  }

  CommandRowsCompanion _transition(
    OutboxEntry entry,
    OutboxState state,
    DateTime now, {
    FinancialFailure? failure,
    String? resultJson,
    DateTime? next,
  }) => CommandRowsCompanion(
    state: Value(state.name),
    revision: Value(_advance(entry.revision)),
    updatedAt: Value(_time(now)),
    nextAttemptAt: Value(_time(next ?? entry.nextAttemptAt)),
    dispatchToken: const Value(null),
    dispatchGeneration: const Value(null),
    dispatchExpiresAt: const Value(null),
    failureCode: Value(failure?.code.name),
    failureRemaining: Value(failure?.remainingMinor),
    resultJson: Value(resultJson),
  );
  int _advance(int counter) {
    if (counter < 0 || counter >= maxExactCommandInteger - 1) {
      throw const LocalOutboxFailure(SyncAvailability.unsupportedSchema);
    }
    return counter + 1;
  }

  Future<bool> _finish(
    LeasedCommand lease,
    DateTime now,
    CommandRowsCompanion Function(OutboxEntry) change,
  ) => _atomic(() async {
    if (lease.dispatch.owner != owner) {
      return false;
    }
    final scope = await _observe(now);
    if (!_matches(scope, lease.dispatch, now)) {
      return false;
    }
    final entry = await _get(lease.entry.command.id);
    if (entry == null ||
        entry.lease == null ||
        !entry.lease!.dispatch.sameFence(lease.dispatch) ||
        entry.lease!.generation != lease.entry.lease!.generation ||
        entry.revision != lease.entry.revision) {
      return false;
    }
    await _write(entry.command.id, change(entry));
    return true;
  });
  @override
  Future<bool> complete(
    LeasedCommand lease,
    Map<String, Object?> result,
    DateTime now,
  ) {
    final json = jsonEncode(freezeCommandJson(result));
    return _finish(
      lease,
      now,
      (entry) =>
          _transition(entry, OutboxState.accepted, now, resultJson: json),
    );
  }

  @override
  Future<bool> defer(
    LeasedCommand lease,
    FinancialFailure failure,
    DateTime nextAttemptAt,
    DateTime now,
  ) => _finish(
    lease,
    now,
    (entry) => _transition(
      entry,
      OutboxState.queued,
      now,
      failure: _safeFailure(failure.code, failure.remainingMinor),
      next: nextAttemptAt,
    ),
  );
  @override
  Future<bool> reject(
    LeasedCommand lease,
    FinancialFailure failure,
    DateTime now,
  ) => _finish(
    lease,
    now,
    (entry) => _transition(
      entry,
      OutboxState.rejected,
      now,
      failure: _safeFailure(failure.code, failure.remainingMinor),
    ),
  );
  @override
  Future<void> releaseDispatch(DispatchLease lease) => _atomic(() async {
    final scope = await _scope();
    if (lease.owner == owner &&
        scope.dispatchToken == lease.token &&
        scope.dispatchGeneration == lease.generation &&
        scope.dispatchExpiresAt == _time(lease.expiresAt)) {
      await _writeScope(
        const OutboxScopesCompanion(
          dispatchToken: Value(null),
          dispatchExpiresAt: Value(null),
        ),
      );
    }
  });
  @override
  Future<bool> cancelUnsent(CommandId id, DateTime now) => _atomic(() async {
    final entry = await _get(id);
    if (entry == null ||
        entry.attempts != 0 ||
        ![OutboxState.queued, OutboxState.blocked].contains(entry.state)) {
      return false;
    }
    await _write(id, _transition(entry, OutboxState.cancelled, now));
    return true;
  });
  @override
  Future<void> retry(CommandId id, DateTime now) => _atomic(() async {
    final entry = await _get(id);
    if (entry == null || entry.state != OutboxState.queued) {
      throw _safeFailure(FinancialFailureCode.recovery);
    }
    await _write(id, _transition(entry, OutboxState.queued, now, next: now));
  });
  @override
  Future<void> close() => _closing ??= (() async {
    _closed = true;
    await database.close();
  })();
}
