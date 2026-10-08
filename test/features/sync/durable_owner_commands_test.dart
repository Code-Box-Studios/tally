import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/sync/data/command_result_validation.dart';
import 'package:tally/features/sync/data/drift_outbox_store.dart';
import 'package:tally/features/sync/data/durable_owner_commands.dart';
import 'package:tally/features/sync/data/firebase_command_transport.dart';
import 'package:tally/features/sync/data/outbox_database.dart';
import 'package:tally/features/sync/domain/command_dependencies.dart';
import 'package:tally/features/sync/domain/command_identity.dart';
import 'package:tally/features/sync/domain/command_name.dart';
import 'package:tally/features/sync/domain/command_submission.dart';
import 'package:tally/features/sync/domain/command_transport.dart';
import 'package:tally/features/sync/domain/frozen_command.dart';
import 'package:tally/features/sync/domain/outbox_entry.dart';
import 'package:tally/features/sync/domain/retry_policy.dart';
import 'package:tally/features/sync/domain/sync_engine.dart';
import 'package:tally/shared/data/owner_command_gateway.dart';
import 'package:tally/shared/domain/financial_failure.dart';

final owner = OwnerUid('alice');
final now = DateTime.utc(2026, 10, 8);

class RawCommands implements OwnerCommandGateway {
  @override
  OwnerUid get owner => OwnerUid('alice');
  final names = <String>[];
  @override
  Future<Map<String, Object?>> call(
    String name,
    CommandId id,
    Map<String, Object?> payload,
  ) async {
    names.add(name);
    return {'raw': true};
  }
}

void main() {
  late DriftOutboxStore store;
  late CommandDependencies dependencies;
  final engines = <SyncEngine>[];
  setUp(() async {
    store = await DriftOutboxStore.open(
      OutboxDatabase(NativeDatabase.memory()),
      owner: owner,
      environmentKey: 'development-demo-tally',
    );
    dependencies = CommandDependencies(
      store: store,
      cachedPaymentObligation: (id) async =>
          id.value == 'known-payment' ? ObligationId('loan') : null,
    );
  });
  tearDown(() async {
    for (final engine in engines) {
      await engine.dispose();
    }
    engines.clear();
    await store.close();
  });
  Future<FrozenCommand> freeze(
    CommandName name,
    String id,
    Map<String, Object?> payload,
  ) => dependencies.freeze(name, CommandId(id), payload, now);
  Future<FrozenCommand> create(
    CommandName name,
    String id, {
    Map<String, Object?> payload = const {},
  }) async {
    final command = await freeze(name, id, payload);
    await store.enqueue(command);
    return command;
  }

  test('pending finite and catalog references infer same-owner dependencies without changing payload', () async {
    for (final kind in ['contact', 'source', 'category']) {
      await create(
        CommandName.saveCatalog,
        'create-$kind',
        payload: {'kind': kind, 'id': null},
      );
    }
    final finite = await create(
      CommandName.createObligation,
      'create-loan',
      payload: {
        'contactId': predictedCommandId(
          owner,
          CommandId('create-contact'),
          'contact',
        ),
        'categoryId': predictedCommandId(
          owner,
          CommandId('create-category'),
          'category',
        ),
      },
    );
    expect(finite.dependencies.map((d) => d.id.value).toSet(), {
      'create-contact',
      'create-category',
    });
    final input = <String, Object?>{
      'obligationId': predictedCommandId(owner, finite.id, 'obligation'),
      'obligationInstanceId': predictedCommandId(owner, finite.id, 'instance'),
      'paymentSourceId': predictedCommandId(
        owner,
        CommandId('create-source'),
        'source',
      ),
      'amountMinor': 2500,
    };
    final payment = await freeze(CommandName.recordPayment, 'partial', input);
    expect(payment.dependencies.map((d) => d.id.value).toSet(), {
      'create-loan',
      'create-source',
    });
    expect(payment.resourceKey, finite.resourceKey);
    expect(payment.payload, input);
    input['amountMinor'] = 9999;
    expect(payment.payload['amountMinor'], 2500);
    expect(payment.dependencies.every((d) => d.owner == owner), isTrue);
  });
  test('cancelling a parent before child freezing retains its dependency and blocks dispatch', () async {
    final parent = await create(
      CommandName.createObligation,
      'cancel-before-child',
    );
    final payload = {
      'obligationId': predictedCommandId(owner, parent.id, 'obligation'),
      'obligationInstanceId': predictedCommandId(owner, parent.id, 'instance'),
      'amountMinor': 2500,
      'currency': 'PHP',
    };
    // Represents another tab cancelling after the dialog captured these IDs.
    await store.cancelUnsent(parent.id, now);
    final child = await freeze(
      CommandName.recordPayment,
      'late-child',
      payload,
    );
    expect(child.dependencies.map((d) => d.id), [parent.id]);
    await store.enqueue(child);
    final dispatch = (await store.claimDispatch(now, token: 'late-child'))!;
    expect(await store.claimNext(dispatch, now), isNull);
    final blocked = (await store.get(child.id))!;
    expect(blocked.state, OutboxState.blocked);
    expect(blocked.attempts, 0);
    expect(blocked.command.payload, payload);
  });

  test('terminal creations outside the newest thousand history rows still bind new children', () async {
    final parent = await create(CommandName.createObligation, 'old-cancelled');
    await store.cancelUnsent(parent.id, now);
    for (var n = 0; n < 1001; n++) {
      final old = await create(CommandName.createObligation, 'history-$n');
      await store.cancelUnsent(old.id, now);
    }
    final child = await freeze(CommandName.recordPayment, 'old-parent-child', {
      'obligationId': predictedCommandId(owner, parent.id, 'obligation'),
      'obligationInstanceId': predictedCommandId(owner, parent.id, 'instance'),
    });
    expect(child.dependencies.single.id, parent.id);
  });
  test('an edit of a pending catalog creation retains its parent even after cancellation', () async {
    final parent = await create(
      CommandName.saveCatalog,
      'new-contact',
      payload: {'kind': 'contact', 'id': null},
    );
    final payload = {
      'kind': 'contact',
      'id': predictedCommandId(owner, parent.id, 'contact'),
      'name': 'New name',
    };
    final queued = await freeze(
      CommandName.saveCatalog,
      'edit-contact',
      payload,
    );
    expect(queued.dependencies.map((d) => d.id), [parent.id]);
    await store.cancelUnsent(parent.id, now);
    final cancelled = await freeze(
      CommandName.saveCatalog,
      'late-contact-edit',
      payload,
    );
    expect(cancelled.dependencies.map((d) => d.id), [parent.id]);
  });

  test(
    'new recurring and installment periods require canonical generation',
    () async {
      for (final name in [
        CommandName.createRecurring,
        CommandName.createInstallment,
      ]) {
        final parent = await create(name, name.name);
        final payload = {
          'obligationId': predictedCommandId(owner, parent.id, 'obligation'),
          'obligationInstanceId': 'guessed-period',
          'amountMinor': 2500,
        };
        for (final payment in [
          CommandName.recordPayment,
          CommandName.recordInstallmentPayment,
        ]) {
          await expectLater(
            freeze(payment, 'pay-${name.name}-${payment.name}', payload),
            throwsA(
              isA<FinancialFailure>().having(
                (e) => e.code,
                'canonical periods',
                FinancialFailureCode.recovery,
              ),
            ),
          );
        }
      }
      final existing = await freeze(
        CommandName.recordPayment,
        'cached-existing',
        {
          'obligationId': 'canonical-recurring',
          'obligationInstanceId': 'canonical-period',
          'amountMinor': 2500,
        },
      );
      expect(existing.dependencies, isEmpty);
    },
  );
  test('accepted creation is canonical; catalog edits retain the existing resource', () async {
    final parent = await create(CommandName.createObligation, 'parent');
    final dispatch = (await store.claimDispatch(now, token: 'accept'))!;
    final lease = (await store.claimNext(dispatch, now))!;
    await store.complete(lease, {
      'obligationId': predictedCommandId(owner, parent.id, 'obligation'),
    }, now);
    final child = await freeze(CommandName.recordPayment, 'child', {
      'obligationId': predictedCommandId(owner, parent.id, 'obligation'),
      'obligationInstanceId': predictedCommandId(owner, parent.id, 'instance'),
    });
    expect(child.dependencies, isEmpty);
    final edit = await freeze(CommandName.saveCatalog, 'edit', {
      'kind': 'source',
      'id': 'existing-card',
    });
    expect(edit.resourceKey, 'source:existing-card');
  });
  test('retry preserves frozen dependencies after the parent leaves pending history', () async {
    final parent = await create(CommandName.createObligation, 'parent');
    final payload = {
      'obligationId': predictedCommandId(owner, parent.id, 'obligation'),
      'obligationInstanceId': predictedCommandId(owner, parent.id, 'instance'),
      'amountMinor': 2500,
    };
    final first = await freeze(CommandName.recordPayment, 'partial', payload);
    await store.enqueue(first);
    final dispatch = (await store.claimDispatch(now, token: 'accept-parent'))!;
    final lease = (await store.claimNext(dispatch, now))!;
    await store.complete(lease, {'obligationId': payload['obligationId']}, now);
    final replay = await freeze(CommandName.recordPayment, 'partial', payload);
    expect(replay.sameIdentity(first), isTrue);
    expect(replay.dependencies.single.id, parent.id);
    expect((await store.enqueue(replay)).sequence, 2);
  });
  test('correction uses cached canonical ownership without adding server payload fields', () async {
    final payload = {
      'paymentId': 'known-payment',
      'reason': 'Wrong amount',
      'replacement': null,
    };
    final correction = await freeze(
      CommandName.correctPayment,
      'correction',
      payload,
    );
    expect(correction.resourceKey, 'obligation:loan');
    expect(correction.payload, payload);
    await expectLater(
      freeze(CommandName.correctPayment, 'missing', {
        'paymentId': 'uncached',
        'replacement': null,
      }),
      throwsA(isA<FinancialFailure>()),
    );
  });
  test('protected transport keeps envelope exact, rejects switched owners and preserves uncertain responses', () async {
    var active = true;
    final sent = <Map<String, Object?>>[];
    Object? answer = {'preferenceRevision': 2};
    final transport = FirebaseCommandTransport(
      owner: owner,
      isOwnerActive: () => active,
      invoke: (name, envelope) async {
        expect(name, 'updateNotificationPreferences');
        sent.add(envelope);
        return answer;
      },
    );
    final action = await freeze(
      CommandName.updateNotificationPreferences,
      'preference',
      {
        'expectedRevision': 1,
        'preferences': {'enabled': true},
      },
    );
    expect(await transport.execute(action), answer);
    expect(sent.single, {
      'commandId': 'preference',
      'expectedOwnerUid': 'alice',
      'payload': action.payload,
    });
    for (final bad in [
      null,
      <Object?>[],
      {'bad': Object()},
      {1: 'wrong-key'},
    ]) {
      answer = bad;
      await expectLater(
        transport.execute(action),
        throwsA(isA<UnverifiedCommandResponse>()),
      );
    }
    active = false;
    final count = sent.length;
    await expectLater(
      transport.execute(action),
      throwsA(isA<FinancialFailure>()),
    );
    expect(sent.length, count);
  });
  test('late transport response after an account switch cannot reach local acceptance', () async {
    var active = true;
    final held = Completer<Object?>();
    final transport = FirebaseCommandTransport(
      owner: owner,
      isOwnerActive: () => active,
      invoke: (_, _) => held.future,
    );
    final action = await freeze(
      CommandName.updateNotificationPreferences,
      'one',
      {},
    );
    final pending = transport.execute(action);
    final assertion = expectLater(
      pending,
      throwsA(
        isA<FinancialFailure>().having(
          (e) => e.code,
          'owner',
          FinancialFailureCode.signIn,
        ),
      ),
    );
    active = false;
    held.complete({'preferenceRevision': 2});
    await assertion;
  });
  test('gateway queues only the twenty durable mutations and preserves excluded raw endpoints', () async {
    final raw = RawCommands();
    final transport = FirebaseCommandTransport(
      owner: owner,
      isOwnerActive: () => true,
      invoke: (_, _) async => throw FirebaseFunctionsException(
        code: 'unavailable',
        message: 'Offline',
      ),
    );
    final engine = SyncEngine(
      store: store,
      transport: transport,
      validateResult: validateCommandResult,
      utcNow: () => now,
      retryPolicy: RetryPolicy(jitter: () => 0),
    );
    engines.add(engine);
    final gateway = DurableOwnerCommands(
      raw: raw,
      engine: engine,
      dependencies: dependencies,
      utcNow: () => now,
    );
    await expectLater(
      gateway.call('updateNotificationPreferences', CommandId('queued'), {
        'expectedRevision': 1,
      }),
      throwsA(
        isA<QueuedCommand>().having(
          (e) => e.commandId.value,
          'identity',
          'queued',
        ),
      ),
    );
    expect((await store.get(CommandId('queued')))!.state, OutboxState.queued);
    expect(raw.names, isEmpty);
    for (final endpoint in [
      'bootstrapUser',
      'prepareAttachment',
      'exportOwnerData',
      'deleteAccount',
      'registerDevice',
    ]) {
      expect(await gateway.call(endpoint, CommandId('raw-$endpoint'), {}), {
        'raw': true,
      });
      expect(await store.get(CommandId('raw-$endpoint')), isNull);
    }
    expect(raw.names.length, 5);
  });
  test('accepted gateway returns verified receipt and known server rejection remains a failure', () async {
    var reject = false;
    final transport = FirebaseCommandTransport(
      owner: owner,
      isOwnerActive: () => true,
      invoke: (_, _) async {
        if (reject) {
          throw FirebaseFunctionsException(
            code: 'aborted',
            message: 'Refresh.',
          );
        }
        return {'preferenceRevision': 2};
      },
    );
    final engine = SyncEngine(
      store: store,
      transport: transport,
      validateResult: validateCommandResult,
      utcNow: () => now,
    );
    engines.add(engine);
    final gateway = DurableOwnerCommands(
      raw: RawCommands(),
      engine: engine,
      dependencies: dependencies,
      utcNow: () => now,
    );
    expect(
      await gateway.call(
        'updateNotificationPreferences',
        CommandId('accepted'),
        {},
      ),
      {'preferenceRevision': 2},
    );
    reject = true;
    await expectLater(
      gateway.call('updateNotificationPreferences', CommandId('rejected'), {}),
      throwsA(
        isA<FinancialFailure>().having(
          (e) => e.code,
          'conflict',
          FinancialFailureCode.conflict,
        ),
      ),
    );
    expect(
      (await store.get(CommandId('rejected')))!.state,
      OutboxState.rejected,
    );
  });
}
