import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/config/environment_providers.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/sync/data/command_result_validation.dart';
import 'package:tally/features/sync/data/drift_outbox_store.dart';
import 'package:tally/features/sync/data/durable_owner_commands.dart';
import 'package:tally/features/sync/data/firebase_command_transport.dart';
import 'package:tally/features/sync/data/outbox_database.dart';
import 'package:tally/features/sync/domain/command_dependencies.dart';
import 'package:tally/features/sync/domain/command_name.dart';
import 'package:tally/features/sync/domain/command_submission.dart';
import 'package:tally/features/sync/domain/frozen_command.dart';
import 'package:tally/features/sync/domain/outbox_entry.dart';
import 'package:tally/features/sync/domain/sync_capability.dart';
import 'package:tally/features/sync/domain/sync_engine.dart';
import 'package:tally/features/sync/presentation/pending_actions_controller.dart';
import 'package:tally/features/sync/presentation/sync_providers.dart';
import 'package:tally/shared/domain/financial_failure.dart';
import 'package:tally/shared/presentation/financial_providers.dart';

import '../financial/repository_paging_test.dart' show FakeCommands;

void main() {
  final owner = OwnerUid('alice'), now = DateTime.utc(2026, 10, 8);
  late DriftOutboxStore store;
  late SyncRuntime runtime;
  late ProviderContainer scope;
  final sent = <FrozenCommand>[];
  FrozenCommand payment(String id) => FrozenCommand(
    owner: owner,
    id: CommandId(id),
    name: CommandName.recordPayment,
    payload: {
      'obligationId': 'loan',
      'obligationInstanceId': 'period',
      'amountMinor': 2500,
      'currency': 'PHP',
    },
    resourceKey: 'obligation:loan',
    createdAt: now,
  );
  setUp(() async {
    sent.clear();
    store = await DriftOutboxStore.open(
      OutboxDatabase(NativeDatabase.memory()),
      owner: owner,
      environmentKey: 'emulator-demo-tally',
    );
    final raw = FakeCommands(owner),
        transport = FirebaseCommandTransport(
          owner: owner,
          isOwnerActive: () => true,
          invoke: (name, envelope) async {
            throw const FinancialFailure(
              FinancialFailureCode.offline,
              'Reconnect.',
            );
          },
        );
    final engine = SyncEngine(
      store: store,
      transport: transport,
      validateResult: validateCommandResult,
    );
    runtime = SyncRuntime(
      owner: owner,
      capability: const SyncCapability(SyncAvailability.durable),
      store: store,
      engine: engine,
      gateway: DurableOwnerCommands(
        raw: raw,
        engine: engine,
        dependencies: CommandDependencies(store: store),
      ),
    );
    scope = ProviderContainer(
      overrides: [
        ownerUidProvider.overrideWithValue(owner),
        environmentProvider.overrideWithValue(
          const EnvironmentConfig.emulator(projectId: 'demo-tally'),
        ),
        ownerCommandsFactoryProvider.overrideWithValue((_) => raw),
        syncRuntimeProvider.overrideWith((ref) async => runtime),
      ],
    );
    await scope.read(syncRuntimeProvider.future);
    scope.listen(pendingActionsControllerProvider, (_, _) {});
  });
  tearDown(() async {
    scope.dispose();
    await runtime.dispose();
  });
  test(
    'only undispatched cancellation produces a retained local tombstone',
    () async {
      await store.enqueue(payment('unsent'));
      await scope
          .read(pendingActionsControllerProvider.notifier)
          .cancel(CommandId('unsent'));
      expect(scope.read(pendingActionsControllerProvider).hasError, isFalse);
      expect(
        (await store.get(CommandId('unsent')))!.state,
        OutboxState.cancelled,
      );
      await store.enqueue(payment('uncertain'));
      final dispatch = (await store.claimDispatch(now, token: 'attempt'))!;
      final lease = (await store.claimNext(dispatch, now))!;
      await store.defer(
        lease,
        const FinancialFailure(FinancialFailureCode.recovery, 'Verify.'),
        now,
        now,
      );
      await scope
          .read(pendingActionsControllerProvider.notifier)
          .cancel(CommandId('uncertain'));
      expect(
        (await store.get(CommandId('uncertain')))!.state,
        OutboxState.queued,
      );
      expect(scope.read(pendingActionsControllerProvider).hasError, isTrue);
    },
  );
  test('review of definitive rejection creates a new immutable intent and keeps original history', () async {
    final original = payment('rejected');
    await store.enqueue(original);
    final dispatch = (await store.claimDispatch(now, token: 'reject'))!;
    final lease = (await store.claimNext(dispatch, now))!;
    await store.reject(
      lease,
      const FinancialFailure(FinancialFailureCode.overpayment, 'Review.'),
      now,
    );
    await store.releaseDispatch(dispatch);
    final result = await scope
        .read(pendingActionsControllerProvider.notifier)
        .review(original.id, {...original.payload, 'amountMinor': 2000});
    expect(result, isA<QueuedSubmission<Object?>>());
    final rows = (await store.getPage()).items;
    expect(rows.length, 2);
    expect(rows.first.command.id, isNot(original.id));
    expect(rows.first.command.payload['amountMinor'], 2000);
    expect(rows.last.command.payload['amountMinor'], 2500);
    expect(rows.last.state, OutboxState.rejected);
  });
  test('each completed review handoff has a new ID and the rejected original can be dismissed', () async {
    final original = payment('review-again');
    await store.enqueue(original);
    final dispatch = (await store.claimDispatch(now, token: 'review-again'))!;
    final lease = (await store.claimNext(dispatch, now))!;
    await store.reject(
      lease,
      const FinancialFailure(FinancialFailureCode.overpayment, 'Review.'),
      now,
    );
    await store.releaseDispatch(dispatch);
    final controller = scope.read(pendingActionsControllerProvider.notifier);
    final first = await controller.review(original.id, original.payload);
    final second = await controller.review(original.id, original.payload);
    expect(
      (second as QueuedSubmission<Object?>).commandId,
      isNot((first as QueuedSubmission<Object?>).commandId),
    );
    await controller.dismiss(original.id);
    expect(
      scope.read(pendingActionsControllerProvider).hasError,
      isFalse,
      reason: scope
          .read(pendingActionsControllerProvider)
          .stackTrace
          ?.toString(),
    );
    expect((await store.get(original.id))!.state, OutboxState.dismissed);
    expect((await store.getPage(unresolvedOnly: true)).items, hasLength(2));
  });

  test('uncertain and undispatched actions cannot be replaced by a reviewed new ID', () async {
    final original = payment('waiting');
    await store.enqueue(original);
    expect(
      await scope.read(pendingActionsControllerProvider.notifier).review(
        original.id,
        {...original.payload, 'amountMinor': 2000},
      ),
      isNull,
    );
    expect((await store.getPage()).items.length, 1);
    expect(scope.read(pendingActionsControllerProvider).hasError, isTrue);
  });
}
