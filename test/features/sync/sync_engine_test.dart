import 'dart:async';
import 'dart:io';

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fake_async/fake_async.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/sync/data/drift_outbox_store.dart';
import 'package:tally/features/sync/data/outbox_database.dart';
import 'package:tally/features/sync/domain/command_name.dart';
import 'package:tally/features/sync/domain/command_submission.dart';
import 'package:tally/features/sync/domain/command_transport.dart';
import 'package:tally/features/sync/domain/frozen_command.dart';
import 'package:tally/features/sync/domain/outbox_entry.dart';
import 'package:tally/features/sync/domain/retry_policy.dart';
import 'package:tally/features/sync/domain/sync_engine.dart';
import 'package:tally/shared/domain/financial_failure.dart';

import '../../support/failing_ack_outbox.dart';

final owner = OwnerUid('alice');
final initial = DateTime.utc(2026, 10, 8, 12);
const offline = FinancialFailure(FinancialFailureCode.offline, 'Reconnect.');
const invalid = FinancialFailure(FinancialFailureCode.invalid, 'Check amount.');
FrozenCommand payment(
  String id, {
  String resource = 'obligation:loan',
  List<String> parents = const [],
}) => FrozenCommand(
  owner: owner,
  id: CommandId(id),
  name: CommandName.recordPayment,
  payload: {
    'obligationId': 'loan',
    'obligationInstanceId': 'period',
    'amountMinor': 2500,
    'currency': 'PHP',
  },
  resourceKey: resource,
  createdAt: initial,
  dependencies: parents
      .map((id) => CommandDependency(owner, CommandId(id)))
      .toList(),
);

final class ControlledTransport implements CommandTransport {
  ControlledTransport(this.operation);
  final Future<Map<String, Object?>> Function(FrozenCommand) operation;
  final sent = <FrozenCommand>[];
  @override
  OwnerUid get owner => OwnerUid('alice');
  @override
  bool isOwnerActive = true;
  @override
  Future<Map<String, Object?>> execute(FrozenCommand command) {
    sent.add(command);
    return operation(command);
  }
}

void main() {
  late Directory directory;
  late DriftOutboxStore store;
  late DateTime now;
  var elapsed = Duration.zero;
  final engines = <SyncEngine>[];
  Future<DriftOutboxStore> open() => DriftOutboxStore.open(
    OutboxDatabase(NativeDatabase(File('${directory.path}/queue.sqlite'))),
    owner: owner,
    environmentKey: 'development-demo-tally',
  );
  SyncEngine engine(ControlledTransport transport) {
    final engine = SyncEngine(
      store: store,
      transport: transport,
      validateResult: (command, result) => result,
      utcNow: () => now,
      monotonicNow: () => elapsed,
      retryPolicy: RetryPolicy(jitter: () => 0),
      leaseToken: () => 'lease-${engines.length}',
    );
    engines.add(engine);
    return engine;
  }

  setUpAll(() => driftRuntimeOptions.dontWarnAboutMultipleDatabases = true);
  tearDownAll(() => driftRuntimeOptions.dontWarnAboutMultipleDatabases = false);
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('tally-engine-');
    store = await open();
    now = initial;
    elapsed = Duration.zero;
  });
  tearDown(() async {
    for (final engine in engines) {
      await engine.dispose();
    }
    engines.clear();
    await store.close();
    await directory.delete(recursive: true);
  });

  test('committed local intent exists before transport and accepted result survives restart', () async {
    final transport = ControlledTransport((command) async {
      final row = await store.get(command.id);
      expect(row!.state, OutboxState.sending);
      expect(row.attempts, 1);
      expect(
        row.command.payloadJson,
        '{"amountMinor":2500,"currency":"PHP","obligationId":"loan","obligationInstanceId":"period"}',
      );
      return {'paymentId': 'one', 'obligationId': 'loan'};
    });
    final sync = engine(transport);
    final result = await sync.submit(payment('one'));
    expect(
      (result as AcceptedSubmission<Map<String, Object?>>).value['paymentId'],
      'one',
    );
    await sync.dispose();
    await store.close();
    store = await open();
    expect((await store.get(CommandId('one')))!.state, OutboxState.accepted);
    expect((await store.get(CommandId('one')))!.result!['paymentId'], 'one');
  });

  test('quota after server commit preserves uncertainty and replays one canonical payment', () async {
    final faulty = FailingAckOutbox(store);
    final canonical = <CommandId, Map<String, Object?>>{};
    final transport = ControlledTransport(
      (command) async =>
          canonical.putIfAbsent(command.id, () => {'paymentId': 'one-payment'}),
    );
    final sync = SyncEngine(
      store: faulty,
      transport: transport,
      validateResult: (_, result) => result,
      utcNow: () => now,
      leaseToken: () => 'quota-lease',
    );
    engines.add(sync);
    await expectLater(
      sync.submit(payment('quota-after-commit')),
      throwsA(
        isA<FinancialFailure>()
            .having(
              (error) => error.code,
              'uncertain',
              FinancialFailureCode.unavailable,
            )
            .having(
              (error) => error.message,
              'honest confirmation',
              contains('confirm'),
            ),
      ),
    );
    expect(canonical, hasLength(1));
    final waiting = (await store.get(CommandId('quota-after-commit')))!;
    expect(waiting.state, OutboxState.sending);
    expect(waiting.command.payload['amountMinor'], 2500);
    expect(await store.cancelUnsent(waiting.command.id, now), isFalse);
    faulty.failAcknowledgements = false;
    now = now.add(const Duration(seconds: 61));
    final reconciled = await sync.submit(payment('quota-after-commit'));
    expect((reconciled as AcceptedSubmission<Map<String, Object?>>).value, {
      'paymentId': 'one-payment',
    });
    expect(canonical, hasLength(1));
    expect(transport.sent, hasLength(2));
    expect(transport.sent.first.sameIdentity(transport.sent.last), isTrue);
  });

  test(
    'unverified acknowledgement remains uncertain until explicit same-ID retry',
    () async {
      var malformed = true;
      final transport = ControlledTransport((_) async {
        if (malformed) throw const UnverifiedCommandResponse();
        return {'paymentId': 'confirmed'};
      });
      final sync = engine(transport);
      expect(
        await sync.submit(payment('uncertain')),
        isA<QueuedSubmission<Map<String, Object?>>>(),
      );
      await sync.flush();
      expect(transport.sent.length, 1);
      expect(
        (await store.get(CommandId('uncertain')))!.failure!.code,
        FinancialFailureCode.recovery,
      );
      expect(await store.cancelUnsent(CommandId('uncertain'), now), isFalse);
      malformed = false;
      await sync.retry(CommandId('uncertain'));
      expect(transport.sent.length, 2);
      expect(transport.sent.first.sameIdentity(transport.sent.last), isTrue);
      expect(
        (await store.get(CommandId('uncertain')))!.state,
        OutboxState.accepted,
      );
    },
  );

  test('twenty-second network timeout preserves uncertainty and ignores late acknowledgement', () async {
    await store.close();
    // The virtual-clock test uses SQLite in memory only for timer control;
    // persistence and restart guarantees are covered by the file-backed cases.
    store = await DriftOutboxStore.open(
      OutboxDatabase(NativeDatabase.memory()),
      owner: owner,
      environmentKey: 'development-demo-tally',
    );
    await store.enqueue(payment('timeout'));
    final held = Completer<Map<String, Object?>>();
    final transport = ControlledTransport((_) => held.future);
    fakeAsync((clock) {
      final sync = SyncEngine(
        store: store,
        transport: transport,
        validateResult: (_, result) => result,
        utcNow: () => initial.add(clock.elapsed),
        monotonicNow: () => clock.elapsed,
        retryPolicy: RetryPolicy(jitter: () => 0),
        leaseToken: () => 'timeout',
      );
      engines.add(sync);
      var finished = false;
      sync.flush().then((_) => finished = true);
      clock.flushMicrotasks();
      expect(transport.sent.length, 1);
      clock.elapse(const Duration(seconds: 19));
      expect(finished, isFalse);
      clock.elapse(const Duration(seconds: 1));
      clock.flushMicrotasks();
      expect(finished, isTrue);
      held.complete({'paymentId': 'late'});
      clock.flushMicrotasks();
      store.get(CommandId('timeout')).then((row) {
        expect(row!.state, OutboxState.queued);
        expect(row.failure!.code, FinancialFailureCode.offline);
        expect(row.nextAttemptAt, initial.add(const Duration(seconds: 21)));
      });
      clock.flushMicrotasks();
      sync.dispose();
      clock.flushMicrotasks();
    });
  });

  test(
    'restart schedules an existing future retry without another user action',
    () async {
      await store.close();
      store = await DriftOutboxStore.open(
        OutboxDatabase(NativeDatabase.memory()),
        owner: owner,
        environmentKey: 'development-demo-tally',
      );
      await store.enqueue(payment('waiting'));
      final dispatch = (await store.claimDispatch(initial, token: 'previous'))!;
      final lease = (await store.claimNext(dispatch, initial))!;
      await store.defer(
        lease,
        offline,
        initial.add(const Duration(seconds: 3)),
        initial,
      );
      await store.releaseDispatch(dispatch);
      final transport = ControlledTransport(
        (_) async => {'paymentId': 'confirmed'},
      );
      fakeAsync((clock) {
        final sync = SyncEngine(
          store: store,
          transport: transport,
          validateResult: (_, result) => result,
          utcNow: () => initial.add(clock.elapsed),
          monotonicNow: () => clock.elapsed,
          leaseToken: () => 'resumed',
        );
        engines.add(sync);
        sync.flush();
        clock.flushMicrotasks();
        expect(transport.sent, isEmpty);
        clock.elapse(const Duration(seconds: 3));
        clock.flushMicrotasks();
        expect(transport.sent.length, 1);
        store
            .get(CommandId('waiting'))
            .then((row) => expect(row!.state, OutboxState.accepted));
        clock.flushMicrotasks();
        sync.dispose();
        clock.flushMicrotasks();
      });
    },
  );

  test(
    'real SQLite write denial produces no transport or queued saved claim',
    () async {
      await store.database.customStatement('PRAGMA query_only=ON');
      final transport = ControlledTransport(
        (_) async => {'paymentId': 'wrong'},
      );
      await expectLater(
        engine(transport).submit(payment('unsaved')),
        throwsA(isA<Exception>()),
      );
      expect(transport.sent, isEmpty);
      expect(await store.get(CommandId('unsaved')), isNull);
    },
  );

  test(
    'lost acknowledgement replays identical identity after restart',
    () async {
      final ledger = <String, int>{};
      var lose = true;
      final transport = ControlledTransport((command) async {
        ledger.putIfAbsent(command.id.value, () => 2500);
        if (lose) {
          lose = false;
          throw offline;
        }
        return {'paymentId': 'one'};
      });
      final first = engine(transport);
      expect(
        await first.submit(payment('one')),
        isA<QueuedSubmission<Map<String, Object?>>>(),
      );
      await first.dispose();
      await store.close();
      store = await open();
      now = initial.add(const Duration(seconds: 1));
      await engine(transport).flush();
      expect(ledger, {'one': 2500});
      expect(transport.sent.length, 2);
      expect(transport.sent[0].sameIdentity(transport.sent[1]), isTrue);
      expect((await store.get(CommandId('one')))!.state, OutboxState.accepted);
      expect((await store.get(CommandId('one')))!.attempts, 2);
    },
  );

  test(
    'duplicate wakes share one dispatch and a changed intent never overwrites',
    () async {
      final pending = Completer<Map<String, Object?>>();
      final started = Completer<void>();
      final transport = ControlledTransport((_) {
        started.complete();
        return pending.future;
      });
      final sync = engine(transport);
      await store.enqueue(payment('one'));
      final flush = sync.flush();
      await started.future;
      final duplicate = sync.flush();
      pending.complete({'paymentId': 'one'});
      await Future.wait([flush, duplicate]);
      expect(transport.sent.length, 1);
      final changed = FrozenCommand(
        owner: owner,
        id: CommandId('one'),
        name: CommandName.recordPayment,
        payload: {'amountMinor': 2501},
        resourceKey: 'obligation:loan',
        createdAt: initial,
      );
      await expectLater(
        sync.submit(changed),
        throwsA(
          isA<FinancialFailure>().having(
            (e) => e.code,
            'conflict',
            FinancialFailureCode.conflict,
          ),
        ),
      );
      expect(
        (await store.get(CommandId('one')))!.command.payload['amountMinor'],
        2500,
      );
    },
  );

  test(
    'rejection is retained while unrelated pending actions may continue',
    () async {
      await store.enqueue(payment('rejected', resource: 'obligation:bad'));
      await store.enqueue(
        payment(
          'dependent',
          resource: 'obligation:child',
          parents: ['rejected'],
        ),
      );
      await store.enqueue(payment('independent', resource: 'obligation:good'));
      final transport = ControlledTransport((command) async {
        if (command.id.value == 'rejected') {
          throw invalid;
        }
        return {'paymentId': 'independent'};
      });
      await engine(transport).flush();
      expect(transport.sent.map((c) => c.id.value), [
        'rejected',
        'independent',
      ]);
      expect(
        (await store.get(CommandId('dependent')))!.state,
        OutboxState.blocked,
      );
      await store.close();
      store = await open();
      expect(
        (await store.get(CommandId('rejected')))!.state,
        OutboxState.rejected,
      );
      expect(
        (await store.get(CommandId('independent')))!.state,
        OutboxState.accepted,
      );
    },
  );

  test(
    'disposing during a held SDK call rejects late UI publication promptly',
    () async {
      final pending = Completer<Map<String, Object?>>(),
          started = Completer<void>();
      final transport = ControlledTransport((_) {
        started.complete();
        return pending.future;
      });
      final sync = engine(transport);
      final submit = sync.submit(payment('late'));
      final failed = expectLater(
        submit,
        throwsA(
          isA<FinancialFailure>().having(
            (e) => e.code,
            'owner',
            FinancialFailureCode.signIn,
          ),
        ),
      );
      await started.future;
      await sync.dispose();
      await failed.timeout(const Duration(seconds: 1));
      pending.complete({'paymentId': 'late'});
      await Future<void>.delayed(Duration.zero);
      expect(
        (await store.get(CommandId('late')))!.state,
        isNot(OutboxState.accepted),
      );
    },
  );

  test(
    'owner switch stops subsequent calls and requires same-owner retry',
    () async {
      final transport = ControlledTransport((_) async => {'paymentId': 'one'});
      final sync = engine(transport);
      transport.isOwnerActive = false;
      await expectLater(
        sync.submit(payment('foreign')),
        throwsA(isA<FinancialFailure>()),
      );
      expect(await store.get(CommandId('foreign')), isNull);
      expect(transport.sent, isEmpty);
    },
  );

  test('one batch starts at most twenty calls', () async {
    for (var i = 0; i < 21; i++) {
      await store.enqueue(payment('p-$i'));
    }
    final transport = ControlledTransport(
      (command) async => {'paymentId': command.id.value},
    );
    await engine(transport).flush();
    expect(transport.sent.length, 20);
    expect((await store.get(CommandId('p-20')))!.state, OutboxState.queued);
  });

  test(
    'thirty monotonic seconds and an expired lease each stop new calls',
    () async {
      for (var i = 0; i < 3; i++) {
        await store.enqueue(payment('p-$i'));
      }
      final transport = ControlledTransport((command) async {
        elapsed = elapsed + const Duration(seconds: 30);
        return {'paymentId': command.id.value};
      });
      final sync = engine(transport);
      await sync.flush();
      expect(transport.sent.length, 1);
      elapsed = Duration.zero;
      final expire = ControlledTransport((command) async {
        now = now.add(const Duration(seconds: 60));
        return {'paymentId': command.id.value};
      });
      await engine(expire).flush();
      expect(expire.sent.length, 1);
      expect(
        (await store.get(CommandId('p-1')))!.state,
        isNot(OutboxState.accepted),
      );
      expect((await store.get(CommandId('p-2')))!.attempts, 0);
    },
  );

  test('authentication failure pauses automatic retries until explicit same-owner retry', () async {
    var signedIn = false;
    final transport = ControlledTransport((_) async {
      if (!signedIn) {
        throw const FinancialFailure(FinancialFailureCode.signIn, 'Sign in.');
      }
      return {'paymentId': 'one'};
    });
    final sync = engine(transport);
    expect(
      await sync.submit(payment('one')),
      isA<QueuedSubmission<Map<String, Object?>>>(),
    );
    await sync.flush();
    expect(transport.sent.length, 1);
    signedIn = true;
    await sync.retry(CommandId('one'));
    expect(transport.sent.length, 2);
    expect((await store.get(CommandId('one')))!.state, OutboxState.accepted);
  });
}
