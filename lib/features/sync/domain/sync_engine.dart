import 'dart:async';
import 'dart:convert';
import 'dart:math';

import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/financial_failure.dart';
import 'command_submission.dart';
import 'command_transport.dart';
import 'frozen_command.dart';
import 'outbox_entry.dart';
import 'outbox_store.dart';
import 'retry_policy.dart';

const _signIn = FinancialFailure(
  FinancialFailureCode.signIn,
  'Sign in to the same account to sync your changes.',
);
const _review = FinancialFailure(
  FinancialFailureCode.recovery,
  'This save needs verification. Retry the same saved action; keep its history.',
);

/// Reconciles immutable intents with the server's permanent command receipts.
final class SyncEngine {
  SyncEngine({
    required this.store,
    required this.transport,
    required this.validateResult,
    DateTime Function()? utcNow,
    this._monotonicNow,
    RetryPolicy? retryPolicy,
    String Function()? leaseToken,
  }) : _utcNow = utcNow ?? (() => DateTime.now().toUtc()),
       _retry = retryPolicy ?? RetryPolicy(),
       _leaseToken = leaseToken ?? _newToken {
    if (store.owner != transport.owner) {
      throw ArgumentError('Sync owners must match.');
    }
    _clock.start();
  }
  final OutboxStore store;
  final CommandTransport transport;
  final CommandResultValidator validateResult;
  final DateTime Function() _utcNow;
  final Duration Function()? _monotonicNow;
  final RetryPolicy _retry;
  final String Function() _leaseToken;
  final _clock = Stopwatch();
  final _cancel = Completer<void>();
  bool _disposed = false, _authenticationPaused = false;
  Future<void>? _flushing;
  Timer? _wake;
  Duration? _wakeAt;
  OwnerUid get owner => store.owner;
  Duration get _elapsed => _monotonicNow?.call() ?? _clock.elapsed;
  static String _newToken() => base64Url
      .encode(List.generate(24, (_) => Random.secure().nextInt(256)))
      .replaceAll('=', '');
  bool get _active => !_disposed && transport.isOwnerActive;
  void _checkOwner() {
    if (!_active) throw _signIn;
  }

  Future<CommandSubmission<Map<String, Object?>>> submit(
    FrozenCommand command,
  ) async {
    _checkOwner();
    if (command.owner != owner) throw _signIn;
    await store.enqueue(command);
    _checkOwner();
    await flush();
    _checkOwner();
    final row = await store.get(command.id);
    _checkOwner();
    if (row == null || !row.command.sameIdentity(command)) throw _review;
    return switch (row.state) {
      OutboxState.accepted => AcceptedSubmission(
        validateResult(row.command, row.result!),
      ),
      OutboxState.rejected ||
      OutboxState.blocked => throw row.failure ?? _review,
      OutboxState.cancelled => throw _review,
      _ => QueuedSubmission(owner, command.id),
    };
  }

  Future<void> flush() {
    if (!_active || _authenticationPaused) return Future.value();
    return _flushing ??= _drain().whenComplete(() => _flushing = null);
  }

  bool _canStart(DispatchLease lease, Duration started) {
    final elapsed = _elapsed - started;
    return _active &&
        !_authenticationPaused &&
        elapsed >= Duration.zero &&
        elapsed < const Duration(seconds: 30) &&
        lease.isValidAt(_utcNow());
  }

  Future<void> _drain() async {
    final started = _elapsed;
    final dispatch = await store.claimDispatch(_utcNow(), token: _leaseToken());
    if (dispatch == null) {
      _schedule(const Duration(seconds: 1));
      return;
    }
    var calls = 0;
    try {
      while (calls < 20 && _canStart(dispatch, started)) {
        final lease = await store.claimNext(dispatch, _utcNow());
        if (lease == null || !_canStart(dispatch, started)) break;
        calls++;
        try {
          final result = await Future.any<Map<String, Object?>>([
            transport
                .execute(lease.entry.command)
                .timeout(
                  const Duration(seconds: 20),
                  onTimeout: () => throw const FinancialFailure(
                    FinancialFailureCode.offline,
                    'Waiting to confirm this saved action.',
                  ),
                ),
            _cancel.future.then((_) => throw _signIn),
          ]);
          if (!_active) break;
          final verified = validateResult(lease.entry.command, result);
          if (!_active) break;
          await store.complete(lease, verified, _utcNow());
        } catch (error) {
          if (!_active) break;
          if (error is UnverifiedCommandResponse) {
            await store.defer(lease, _review, _utcNow(), _utcNow());
            continue;
          }
          final failure = error is FinancialFailure
              ? error
              : const FinancialFailure(
                  FinancialFailureCode.unavailable,
                  'Could not confirm this saved action.',
                );
          switch (failure.code) {
            case FinancialFailureCode.offline:
            case FinancialFailureCode.unavailable:
              final delay = _retry.delayFor(lease.entry.attempts);
              await store.defer(
                lease,
                failure,
                _utcNow().add(delay),
                _utcNow(),
              );
              _schedule(delay);
            case FinancialFailureCode.signIn:
              await store.defer(lease, failure, _utcNow(), _utcNow());
              _authenticationPaused = true;
              _wake?.cancel();
            case FinancialFailureCode.conflict:
            case FinancialFailureCode.overpayment:
            case FinancialFailureCode.invalid:
            case FinancialFailureCode.recovery:
              await store.reject(lease, failure, _utcNow());
          }
        }
      }
      if (calls == 20 ||
          _active && !_authenticationPaused && !_canStart(dispatch, started)) {
        _schedule(const Duration(seconds: 1));
      }
    } finally {
      try {
        await store.releaseDispatch(dispatch);
      } catch (_) {
        if (!_disposed) rethrow;
      }
    }
    if (_active && !_authenticationPaused) await _schedulePending();
  }

  Future<void> _schedulePending() async {
    final page = await store.getPage(limit: 1000, unresolvedOnly: true);
    if (!_active || _authenticationPaused) return;
    final entries = page.items.toList()
      ..sort((a, b) => a.sequence.compareTo(b.sequence));
    final held = <String>{};
    Duration? earliest;
    for (final entry in entries) {
      if (entry.state == OutboxState.rejected) continue;
      final first = held.add(entry.command.resourceKey);
      if (!first ||
          entry.state == OutboxState.blocked ||
          entry.failure?.code == FinancialFailureCode.recovery) {
        continue;
      }
      var ready = true;
      for (final dependency in entry.command.dependencies) {
        if ((await store.get(dependency.id))?.state != OutboxState.accepted) {
          ready = false;
        }
        if (!_active) return;
      }
      if (!ready) continue;
      final due = entry.state == OutboxState.sending
          ? entry.lease!.dispatch.expiresAt
          : entry.nextAttemptAt;
      final difference = due.difference(_utcNow());
      final delay = difference > Duration.zero
          ? difference
          : const Duration(seconds: 1);
      if (earliest == null || delay < earliest) earliest = delay;
    }
    if (earliest != null) _schedule(earliest);
  }

  void _schedule(Duration delay) {
    if (!_active || _authenticationPaused) return;
    final deadline = _elapsed + delay;
    if ((_wake?.isActive ?? false) && _wakeAt! <= deadline) return;
    _wake?.cancel();
    _wakeAt = deadline;
    _wake = Timer(delay, () {
      _wake = null;
      _wakeAt = null;
      // Background failures remain in durable rows. Explicit retry exposes
      // storage errors to the action layer without an unhandled future.
      unawaited(flush().catchError((Object _) {}));
    });
  }

  Future<void> retry(CommandId id) async {
    _checkOwner();
    await store.retry(id, _utcNow());
    _checkOwner();
    _authenticationPaused = false;
    await flush();
  }

  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    _wake?.cancel();
    _clock.stop();
    _cancel.complete();
  }
}
