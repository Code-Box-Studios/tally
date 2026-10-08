import 'dart:io';

import 'package:drift/native.dart';
import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/sync/data/drift_outbox_store.dart';
import 'package:tally/features/sync/data/outbox_database.dart';
import 'package:tally/features/sync/data/outbox_open.dart';
import 'package:tally/features/sync/domain/command_name.dart';
import 'package:tally/features/sync/domain/frozen_command.dart';
import 'package:tally/features/sync/domain/outbox_entry.dart';
import 'package:tally/features/sync/domain/sync_capability.dart';
import 'package:tally/shared/domain/financial_failure.dart';

final alice = OwnerUid('alice');
final now = DateTime.utc(2026, 10, 8, 12);
const environment = 'development-demo-tally';
const offline = FinancialFailure(FinancialFailureCode.offline, 'Reconnect.');
const invalid = FinancialFailure(
  FinancialFailureCode.invalid,
  'Check details.',
);

FrozenCommand action(
  String id, {
  String resource = 'obligation:loan',
  int amount = 2500,
  List<String> parents = const [],
}) => FrozenCommand(
  owner: alice,
  id: CommandId(id),
  name: CommandName.recordPayment,
  payload: {'amountMinor': amount, 'currency': 'PHP'},
  resourceKey: resource,
  dependencies: parents
      .map((id) => CommandDependency(alice, CommandId(id)))
      .toList(),
  createdAt: now,
);

void main() {
  late Directory directory;
  final stores = <DriftOutboxStore>[];
  Future<DriftOutboxStore> open({
    OwnerUid? owner,
    String env = environment,
    String file = 'commands.sqlite',
  }) async {
    final store = await DriftOutboxStore.open(
      OutboxDatabase(
        NativeDatabase.createInBackground(File('${directory.path}/$file')),
      ),
      owner: owner ?? alice,
      environmentKey: env,
    );
    stores.add(store);
    return store;
  }

  setUpAll(() {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  });
  tearDownAll(() {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = false;
  });
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('tally-outbox-');
  });
  tearDown(() async {
    for (final store in stores) {
      await store.close();
    }
    stores.clear();
    await directory.delete(recursive: true);
  });

  test(
    'real file survives reopen and duplicate enqueue preserves first identity',
    () async {
      var store = await open();
      final initial = await store.enqueue(action('payment-1'));
      await store.close();
      store = await open();
      final restored = await store.get(CommandId('payment-1'));
      expect(
        restored!.command.payloadJson,
        '{"amountMinor":2500,"currency":"PHP"}',
      );
      expect(restored.sequence, initial.sequence);
      expect(restored.command.createdAt, now);
      expect(
        (await store.enqueue(action('payment-1'))).sequence,
        initial.sequence,
      );
      await expectLater(
        store.enqueue(action('payment-1', amount: 2501)),
        throwsA(
          isA<FinancialFailure>().having(
            (e) => e.code,
            'code',
            FinancialFailureCode.conflict,
          ),
        ),
      );
      expect(
        (await store.get(CommandId('payment-1')))!
            .command
            .payload['amountMinor'],
        2500,
      );
    },
  );

  test('missing and excessive dependency chains cannot be persisted', () async {
    final store = await open();
    await expectLater(
      store.enqueue(action('orphan', parents: ['missing'])),
      throwsA(isA<FinancialFailure>()),
    );
    for (var i = 0; i < 17; i++) {
      await store.enqueue(
        action(
          'level-$i',
          resource: 'obligation:loan-$i',
          parents: i == 0 ? [] : ['level-${i - 1}'],
        ),
      );
    }
    await expectLater(
      store.enqueue(action('too-deep', parents: ['level-16'])),
      throwsA(isA<FinancialFailure>()),
    );
    expect(await store.get(CommandId('orphan')), isNull);
    expect(await store.get(CommandId('too-deep')), isNull);
  });

  test(
    'unresolved cap fails without losing the original thousand drafts',
    () async {
      final store = await open();
      for (var i = 0; i < 1000; i++) {
        await store.enqueue(action('p-$i'));
      }
      await expectLater(
        store.enqueue(action('overflow')),
        throwsA(
          isA<LocalOutboxFailure>().having(
            (e) => e.availability,
            'capacity',
            SyncAvailability.quota,
          ),
        ),
      );
      expect(await store.get(CommandId('overflow')), isNull);
      expect((await store.enqueue(action('p-0'))).sequence, 1);
      expect(await store.cancelUnsent(CommandId('p-0'), now), isTrue);
      expect((await store.enqueue(action('after-cancel'))).sequence, 1001);
    },
  );

  test(
    'per-resource order holds while an independent action can dispatch',
    () async {
      final store = await open();
      await store.enqueue(action('first'));
      await store.enqueue(action('second'));
      await store.enqueue(action('independent', resource: 'obligation:other'));
      final dispatch = (await store.claimDispatch(now, token: 'worker-a'))!;
      final first = (await store.claimNext(dispatch, now))!;
      expect(first.entry.command.id.value, 'first');
      expect(
        await store.defer(
          first,
          offline,
          now.add(const Duration(minutes: 1)),
          now,
        ),
        isTrue,
      );
      final other = (await store.claimNext(dispatch, now))!;
      expect(other.entry.command.id.value, 'independent');
      expect(
        await store.complete(other, {'paymentId': 'other-payment'}, now),
        isTrue,
      );
      expect(await store.claimNext(dispatch, now), isNull);
      await store.releaseDispatch(dispatch);
      final next = (await store.claimDispatch(
        now.add(const Duration(minutes: 1)),
        token: 'worker-b',
      ))!;
      final retried = (await store.claimNext(
        next,
        now.add(const Duration(minutes: 1)),
      ))!;
      expect(retried.entry.command.id.value, 'first');
      expect(retried.entry.attempts, 2);
      await store.complete(retried, {
        'paymentId': 'first-payment',
      }, now.add(const Duration(minutes: 1)));
      expect(
        (await store.claimNext(
          next,
          now.add(const Duration(minutes: 1)),
        ))!.entry.command.id.value,
        'second',
      );
    },
  );

  test(
    'unresolved pages find older drafts independently of accepted history',
    () async {
      final store = await open();
      await store.enqueue(action('old', resource: 'obligation:old'));
      await store.enqueue(action('new', resource: 'obligation:new'));
      final dispatch = (await store.claimDispatch(now, token: 'history'))!;
      final old = (await store.claimNext(dispatch, now))!;
      await store.defer(old, offline, now.add(const Duration(days: 1)), now);
      final newer = (await store.claimNext(dispatch, now))!;
      await store.complete(newer, {'paymentId': 'new'}, now);
      final history = await store.getPage(limit: 1);
      expect(history.items.single.command.id.value, 'new');
      final pending = await store.getPage(limit: 1, unresolvedOnly: true);
      expect(pending.items.single.command.id.value, 'old');
      expect(pending.hasMore, isFalse);
      expect(
        (await store.watch(limit: 1, unresolvedOnly: true).first)
            .items
            .single
            .command
            .id
            .value,
        'old',
      );
      await expectLater(
        store.getPage(after: history.nextCursor, unresolvedOnly: true),
        throwsA(isA<FinancialFailure>()),
      );
    },
  );

  test(
    'unverified responses hold their resource until explicit same-ID retry',
    () async {
      final store = await open();
      await store.enqueue(action('uncertain'));
      await store.enqueue(action('later'));
      await store.enqueue(action('independent', resource: 'obligation:other'));
      final dispatch = (await store.claimDispatch(now, token: 'review'))!;
      final lease = (await store.claimNext(dispatch, now))!;
      await store.defer(
        lease,
        const FinancialFailure(FinancialFailureCode.recovery, 'Verify.'),
        now,
        now,
      );
      expect(
        (await store.claimNext(dispatch, now))!.entry.command.id.value,
        'independent',
      );
      expect(await store.claimNext(dispatch, now), isNull);
      expect(await store.cancelUnsent(CommandId('uncertain'), now), isFalse);
      await store.retry(CommandId('uncertain'), now);
      expect(
        (await store.claimNext(dispatch, now))!.entry.command.id.value,
        'uncertain',
      );
    },
  );

  test(
    'rejected and cancelled parents block children with preserved payloads',
    () async {
      final store = await open();
      await store.enqueue(action('parent', resource: 'obligation:parent'));
      final child = action(
        'child',
        resource: 'obligation:child',
        parents: ['parent'],
      );
      await store.enqueue(child);
      await store.enqueue(
        action('cancel-parent', resource: 'obligation:cancel-parent'),
      );
      await store.enqueue(
        action(
          'cancel-child',
          resource: 'obligation:cancel-child',
          parents: ['cancel-parent'],
        ),
      );
      expect(await store.cancelUnsent(CommandId('cancel-parent'), now), isTrue);
      final dispatch = (await store.claimDispatch(now, token: 'worker'))!;
      final parent = (await store.claimNext(dispatch, now))!;
      expect(parent.entry.command.id.value, 'parent');
      await store.reject(parent, invalid, now);
      expect(await store.claimNext(dispatch, now), isNull);
      expect((await store.get(CommandId('child')))!.state, OutboxState.blocked);
      expect(
        (await store.get(CommandId('child')))!.command.payloadJson,
        child.payloadJson,
      );
      expect(
        (await store.get(CommandId('cancel-child')))!.state,
        OutboxState.blocked,
      );
      await expectLater(
        store.retry(CommandId('parent'), now),
        throwsA(isA<FinancialFailure>()),
      );
    },
  );

  test('accepted parent enables the unchanged child and retains reconciliation result', () async {
    final store = await open();
    await store.enqueue(action('parent', resource: 'obligation:parent'));
    final child = action('child', parents: ['parent']);
    await store.enqueue(child);
    final dispatch = (await store.claimDispatch(now, token: 'worker'))!;
    final parent = (await store.claimNext(dispatch, now))!;
    await store.complete(parent, {
      'paymentId': 'parent-payment',
      'revision': 2,
    }, now);
    final leasedChild = (await store.claimNext(dispatch, now))!;
    expect(leasedChild.entry.command.payloadJson, child.payloadJson);
    await store.releaseDispatch(dispatch);
    await store.close();
    final reopened = await open();
    expect((await reopened.get(CommandId('parent')))!.result, {
      'paymentId': 'parent-payment',
      'revision': 2,
    });
    expect(await reopened.cancelUnsent(CommandId('child'), now), isFalse);
  });

  test(
    'two real background connections cannot hold one owner lease at once',
    () async {
      final first = await open();
      final second = await open();
      final claims = await Future.wait([
        first.claimDispatch(now, token: 'a'),
        second.claimDispatch(now, token: 'b'),
      ]);
      expect(claims.whereType<DispatchLease>().length, 1);
      final winner = claims.whereType<DispatchLease>().single;
      await first.releaseDispatch(winner);
      expect(await second.claimDispatch(now, token: 'next'), isNotNull);
    },
  );

  test(
    'microsecond wall clock survives the persisted dispatch fence',
    () async {
      final store = await open();
      await store.enqueue(action('payment'));
      final precise = now.add(const Duration(microseconds: 123));
      final dispatch = (await store.claimDispatch(precise, token: 'worker'))!;
      final row = (await store.claimNext(dispatch, precise))!;
      expect(
        await store.complete(row, {'paymentId': 'payment'}, precise),
        isTrue,
      );
      expect((await store.get(CommandId('payment')))!.result, {
        'paymentId': 'payment',
      });
    },
  );

  test(
    'a reviewed new action can follow a definitive rejection on its resource',
    () async {
      final store = await open();
      await store.enqueue(action('incorrect', amount: 5000));
      await store.enqueue(action('reviewed', amount: 2500));
      final dispatch = (await store.claimDispatch(now, token: 'worker'))!;
      final incorrect = (await store.claimNext(dispatch, now))!;
      await store.reject(
        incorrect,
        const FinancialFailure(
          FinancialFailureCode.overpayment,
          'Review amount.',
        ),
        now,
      );
      expect(
        (await store.claimNext(dispatch, now))!.entry.command.id.value,
        'reviewed',
      );
      final retained = (await store.get(CommandId('incorrect')))!;
      expect(retained.state, OutboxState.rejected);
      expect(retained.command.payload['amountMinor'], 5000);
    },
  );

  test(
    'a foreign lease cannot invalidate the current owner with an earlier clock',
    () async {
      final store = await open();
      await store.enqueue(action('payment'));
      final dispatch = (await store.claimDispatch(now, token: 'worker'))!;
      final alien = DispatchLease(
        owner: OwnerUid('bob'),
        token: 'foreign',
        generation: 1,
        expiresAt: now.add(const Duration(seconds: 30)),
      );
      expect(
        await store.claimNext(alien, now.subtract(const Duration(hours: 1))),
        isNull,
      );
      final current = await store.claimNext(dispatch, now);
      expect(current, isNotNull);
      expect(
        await store.complete(current!, {'paymentId': 'private-payment'}, now),
        isTrue,
      );
    },
  );

  test(
    'counter overflow is rejected without corrupting the retained draft',
    () async {
      final database = OutboxDatabase(
        NativeDatabase(File('${directory.path}/counter.sqlite')),
      );
      final store = await DriftOutboxStore.open(
        database,
        owner: alice,
        environmentKey: environment,
      );
      stores.add(store);
      await store.enqueue(action('last-counter'));
      await database.customStatement(
        "UPDATE command_rows SET revision = 9007199254740990 WHERE command_id = 'last-counter'",
      );
      await expectLater(
        store.retry(CommandId('last-counter'), now),
        throwsA(isA<LocalOutboxFailure>()),
      );
      expect(
        (await store.get(CommandId('last-counter')))!.state,
        OutboxState.queued,
      );
      expect(
        (await store.get(CommandId('last-counter')))!.revision,
        9007199254740990,
      );
    },
  );

  test('expired row is reclaimed and stale acknowledgement cannot replace its result', () async {
    final store = await open();
    await store.enqueue(action('payment'));
    final old = (await store.claimDispatch(now, token: 'old'))!;
    final oldRow = (await store.claimNext(old, now))!;
    final later = now.add(const Duration(seconds: 60));
    expect(await store.complete(oldRow, {'paymentId': 'late'}, later), isFalse);
    final fresh = (await store.claimDispatch(later, token: 'new'))!;
    final freshRow = (await store.claimNext(fresh, later))!;
    expect(freshRow.entry.command.sameIdentity(oldRow.entry.command), isTrue);
    expect(freshRow.entry.attempts, 2);
    expect(
      await store.complete(oldRow, {'paymentId': 'wrong'}, later),
      isFalse,
    );
    expect(await store.complete(freshRow, {'paymentId': 'one'}, later), isTrue);
    expect((await store.get(CommandId('payment')))!.result, {
      'paymentId': 'one',
    });
  });

  test(
    'backwards clock invalidates the old generation before reclaim',
    () async {
      final store = await open();
      await store.enqueue(action('payment'));
      final first = (await store.claimDispatch(now, token: 'first'))!;
      final row = (await store.claimNext(first, now))!;
      final earlier = now.subtract(const Duration(hours: 1));
      final fresh = (await store.claimDispatch(earlier, token: 'fresh'))!;
      expect(fresh.generation, greaterThan(first.generation));
      expect(
        await store.complete(row, {'paymentId': 'stale'}, earlier),
        isFalse,
      );
      expect(
        (await store.claimNext(fresh, earlier))!.entry.command.id.value,
        'payment',
      );
    },
  );

  test(
    'pagination and watch are bounded and reject a foreign cursor',
    () async {
      final store = await open();
      for (var i = 0; i < 5; i++) {
        await store.enqueue(action('p-$i'));
      }
      final page = await store.getPage(limit: 2);
      expect(page.items.map((e) => e.command.id.value), ['p-4', 'p-3']);
      expect(page.hasMore, isTrue);
      expect(
        (await store.getPage(
          limit: 2,
          after: page.nextCursor,
        )).items.map((e) => e.command.id.value),
        ['p-2', 'p-1'],
      );
      expect((await store.watch(limit: 2).first).items.length, 2);
      final other = await open(owner: OwnerUid('bob'), file: 'bob.sqlite');
      await expectLater(
        other.getPage(after: page.nextCursor),
        throwsA(isA<FinancialFailure>()),
      );
      await expectLater(store.getPage(limit: 1001), throwsArgumentError);
    },
  );

  test(
    'owner and environment cannot reuse another database or command',
    () async {
      final store = await open();
      await store.enqueue(action('private'));
      await expectLater(
        open(owner: OwnerUid('bob')),
        throwsA(isA<LocalOutboxFailure>()),
      );
      await expectLater(
        open(env: 'production-real-project'),
        throwsA(isA<LocalOutboxFailure>()),
      );
      final bob = await open(owner: OwnerUid('bob'), file: 'bob.sqlite');
      await expectLater(
        bob.enqueue(action('foreign')),
        throwsA(isA<FinancialFailure>()),
      );
      expect(await bob.get(CommandId('private')), isNull);
      expect(
        outboxDatabaseName(alice, environment),
        isNot(outboxDatabaseName(OwnerUid('bob'), environment)),
      );
      expect(
        outboxDatabaseName(alice, environment),
        isNot(outboxDatabaseName(alice, 'production-real-project')),
      );
      expect(outboxDatabaseName(alice, environment), isNot(contains('alice')));
    },
  );

  test(
    'unknown schema is preserved and never migrated into the current format',
    () async {
      final file = File('${directory.path}/commands.sqlite');
      final raw = sqlite3.open(file.path);
      raw.execute('CREATE TABLE future_evidence(value TEXT)');
      raw.execute("INSERT INTO future_evidence VALUES ('keep')");
      raw.execute('PRAGMA user_version = 2');
      raw.close();
      await expectLater(
        open(),
        throwsA(
          isA<LocalOutboxFailure>().having(
            (e) => e.availability,
            'schema',
            SyncAvailability.unsupportedSchema,
          ),
        ),
      );
      final preserved = sqlite3.open(file.path);
      expect(preserved.select('PRAGMA user_version').single['user_version'], 2);
      expect(
        preserved.select('SELECT value FROM future_evidence').single['value'],
        'keep',
      );
      preserved.close();
    },
  );

  test(
    'actual SQLite write failure makes no queued row or saved claim',
    () async {
      final database = OutboxDatabase(
        NativeDatabase(File('${directory.path}/readonly.sqlite')),
      );
      final store = await DriftOutboxStore.open(
        database,
        owner: alice,
        environmentKey: environment,
      );
      stores.add(store);
      await database.customStatement('PRAGMA query_only = ON');
      await expectLater(
        store.enqueue(action('not-saved')),
        throwsA(isA<LocalOutboxFailure>()),
      );
      expect(await store.get(CommandId('not-saved')), isNull);
    },
  );

  test('corrupt stored command fails visibly without dispatch or erasure', () async {
    final database = OutboxDatabase(
      NativeDatabase(File('${directory.path}/corrupt.sqlite')),
    );
    final store = await DriftOutboxStore.open(
      database,
      owner: alice,
      environmentKey: environment,
    );
    stores.add(store);
    await store.enqueue(action('broken'));
    await database.customStatement(
      "UPDATE command_rows SET command_json = '{}' WHERE command_id = 'broken'",
    );
    await expectLater(
      store.get(CommandId('broken')),
      throwsA(isA<LocalOutboxFailure>()),
    );
    final dispatch = (await store.claimDispatch(now, token: 'worker'))!;
    await expectLater(
      store.claimNext(dispatch, now),
      throwsA(isA<LocalOutboxFailure>()),
    );
    expect(
      (await database
              .customSelect('SELECT COUNT(*) AS n FROM command_rows')
              .getSingle())
          .read<int>('n'),
      1,
    );
  });
}
