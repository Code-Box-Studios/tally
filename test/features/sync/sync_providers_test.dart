import 'dart:async';

import 'package:drift/drift.dart' show driftRuntimeOptions;
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
import 'package:tally/features/sync/domain/command_submission.dart';
import 'package:tally/features/sync/domain/sync_capability.dart';
import 'package:tally/features/sync/domain/sync_engine.dart';
import 'package:tally/features/sync/presentation/sync_providers.dart';
import 'package:tally/shared/domain/financial_failure.dart';
import 'package:tally/shared/data/owner_command_gateway.dart';
import 'package:tally/shared/presentation/financial_actions.dart';
import 'package:tally/shared/presentation/financial_providers.dart';

import '../financial/repository_paging_test.dart'
    show FakeDocuments, FakeCommands;
import '../financial/financial_scope_test.dart' show draft;

void main() {
  final runtimes = <SyncRuntime>[];
  final requests = <String>[];
  Completer<Object?>? held;
  Future<SyncRuntime> factory(
    OwnerUid owner,
    String environment,
    bool trusted,
    OwnerCommandGateway raw,
    bool Function() active,
  ) async {
    final store = await DriftOutboxStore.open(
      OutboxDatabase(NativeDatabase.memory()),
      owner: owner,
      environmentKey: environment,
    );
    final transport = FirebaseCommandTransport(
      owner: owner,
      isOwnerActive: active,
      invoke: (name, envelope) {
        requests.add(envelope['expectedOwnerUid'] as String);
        return held?.future ??
            Future.error(
              const FinancialFailure(
                FinancialFailureCode.offline,
                'Reconnect.',
              ),
            );
      },
    );
    final engine = SyncEngine(
      store: store,
      transport: transport,
      validateResult: validateCommandResult,
    );
    final runtime = SyncRuntime(
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
    runtimes.add(runtime);
    return runtime;
  }

  late ProviderContainer root;
  final scopes = <ProviderContainer>[];
  setUpAll(() => driftRuntimeOptions.dontWarnAboutMultipleDatabases = true);
  tearDownAll(() => driftRuntimeOptions.dontWarnAboutMultipleDatabases = false);
  setUp(() {
    held = null;
    requests.clear();
    root = ProviderContainer(
      overrides: [
        environmentProvider.overrideWithValue(
          const EnvironmentConfig.emulator(
            projectId: 'demo-tally',
            endpoints: EmulatorEndpoints(host: '127.0.0.1'),
          ),
        ),
        ownerDocumentsFactoryProvider.overrideWithValue(
          (owner) => FakeDocuments(owner, count: 1),
        ),
        ownerCommandsFactoryProvider.overrideWithValue(
          (owner) => FakeCommands(owner),
        ),
        trustedDeviceChoiceProvider.overrideWith((ref) async => true),
        syncRuntimeFactoryProvider.overrideWithValue(factory),
      ],
    );
  });
  tearDown(() async {
    for (final scope in scopes) {
      scope.dispose();
    }
    scopes.clear();
    root.dispose();
    for (final runtime in runtimes) {
      await runtime.dispose();
    }
    runtimes.clear();
  });
  ProviderContainer scope(String uid) {
    final child = ProviderContainer(
      parent: root,
      overrides: [ownerUidProvider.overrideWithValue(OwnerUid(uid))],
    );
    scopes.add(child);
    return child;
  }

  test('durable provider keeps pending money separate from canonical repository reads and raw endpoints', () async {
    final alice = scope('alice');
    alice.listen(financialActionsProvider, (_, _) {});
    final submission = await alice
        .read(financialActionsProvider.notifier)
        .createObligation(draft());
    expect(submission, isA<QueuedSubmission<Object?>>());
    final runtime = await alice.read(syncRuntimeProvider.future);
    expect(
      (await runtime.store!.getPage()).items.single.command.owner,
      OwnerUid('alice'),
    );
    final canonical = await alice
        .read(obligationsRepositoryProvider)
        .watchObligations()
        .first;
    expect(canonical.items.single.originalAmount!.minorUnits, 1000000);
    expect(canonical.items.single.id.value, 'loan-0');
    final before = requests.length;
    final raw = alice.read(rawOwnerCommandGatewayProvider) as FakeCommands;
    await raw.call('refreshSummary', CommandId('raw'), {});
    expect(requests.length, before);
    expect((await runtime.store!.getPage()).items.length, 1);
  });
  test('disposing owner scope stops held work and the next account sees its own empty outbox', () async {
    held = Completer<Object?>();
    final alice = scope('alice');
    alice.listen(financialActionsProvider, (_, _) {});
    final pending = alice
        .read(financialActionsProvider.notifier)
        .createObligation(draft());
    final runtime = await alice.read(syncRuntimeProvider.future);
    for (var i = 0; i < 20 && requests.isEmpty; i++) {
      await Future<void>.delayed(Duration.zero);
    }
    expect(requests, ['alice']);
    alice.dispose();
    scopes.remove(alice);
    expect(await pending, isNull);
    expect(runtime.isDisposed, isTrue);
    held!.complete({'obligationId': 'late'});
    held = null;
    final bob = scope('bob');
    final next = await bob.read(syncRuntimeProvider.future);
    expect(next.owner, OwnerUid('bob'));
    expect((await next.store!.getPage()).items, isEmpty);
    expect(requests, ['alice']);
  });
}
