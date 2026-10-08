import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/accounts/data/deletion_handoff_store.dart';
import 'package:tally/features/accounts/domain/account_deletion.dart';
import 'package:tally/features/accounts/domain/account_deletion_controller.dart';
import 'package:tally/features/accounts/domain/deletion_handoff_store.dart';
import 'package:tally/features/accounts/domain/owner_local_cleanup.dart';
import 'package:tally/features/accounts/presentation/account_deletion_providers.dart';
import 'package:tally/features/accounts/presentation/deletion_recovery_providers.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/sync/presentation/sync_providers.dart';

const environment = 'emulator-demo-tally';
const confirmation = DeletionConfirmation(acknowledged: true, text: 'DELETE');
final alice = OwnerUid('alice'), bob = OwnerUid('bob');

final class Authentication implements RecentAuthentication {
  OwnerUid? active = alice;
  int verified = 0;
  final signedOut = <OwnerUid>[];
  Object? signOutFailure;
  Completer<void>? held;
  Object? failure;
  @override
  Set<ReauthenticationProvider> get providers => {
    ReauthenticationProvider.password,
    ReauthenticationProvider.google,
  };
  @override
  bool isOwnerActive(OwnerUid owner) => active == owner;
  @override
  Future<void> reauthenticate(
    OwnerUid owner, {
    String? password,
    ReauthenticationProvider? provider,
  }) async {
    verified++;
    await held?.future;
    if (failure != null) throw failure!;
  }

  @override
  Future<void> signOutIfOwner(OwnerUid owner) async {
    if (signOutFailure != null && active == owner) throw signOutFailure!;
    if (active == owner) {
      signedOut.add(owner);
      active = null;
    }
  }
}

final class Repository implements AccountDeletionRepository {
  Repository(this.authentication);
  final Authentication authentication;
  @override
  OwnerUid get owner => alice;
  final ids = <CommandId>[];
  int statusCalls = 0;
  Completer<DeletionView>? held;
  Object? failure;
  DeletionView? existing;
  bool requireVerification = true;
  @override
  Future<DeletionView> request(CommandId id) async {
    if (!authentication.isOwnerActive(owner)) {
      throw const DeletionFailure(DeletionFailureCode.changedOwner);
    }
    if (requireVerification && authentication.verified == 0) {
      throw StateError('No recent authentication');
    }
    ids.add(id);
    if (failure != null) throw failure!;
    return held == null
        ? DeletionView(
            alice,
            DeletionStatus.pending,
            DeletionStep.revokeSessions,
          )
        : await held!.future;
  }

  @override
  Future<DeletionView?> status() async {
    statusCalls++;
    if (!authentication.isOwnerActive(owner)) {
      throw const DeletionFailure(DeletionFailureCode.changedOwner);
    }
    return existing;
  }
}

final class Cleanup implements OwnerLocalCleanup {
  Cleanup(this.handoffs);
  final DeletionHandoffStore handoffs;
  final owners = <OwnerUid>[];
  Completer<void>? held;
  bool fail = false;
  @override
  Future<void> quiesceAndPurge(OwnerUid owner, String environment) async {
    final marker = await handoffs.read(owner, environment);
    if (marker?.accepted != true) throw StateError('Purged before acceptance');
    owners.add(owner);
    await held?.future;
    if (fail) throw StateError('secret-native-path');
    await handoffs.remove(marker!);
  }
}

final class FailingHandoffs implements DeletionHandoffStore {
  FailingHandoffs(this.inner);
  final DeletionHandoffStore inner;
  bool failAcceptance = true;
  @override
  Future<DeletionHandoff?> read(OwnerUid owner, String env) =>
      inner.read(owner, env);
  @override
  Future<void> write(DeletionHandoff value) async {
    if (failAcceptance && value.accepted) {
      throw StateError('Disk full private path');
    }
    await inner.write(value);
  }

  @override
  Future<void> remove(DeletionHandoff value) => inner.remove(value);
  @override
  Future<List<DeletionHandoff>> readEnvironment(String env) =>
      inner.readEnvironment(env);
}

Future<void> spinUntil(bool Function() ready) async {
  for (var i = 0; i < 100 && !ready(); i++) {
    await Future<void>.delayed(Duration.zero);
  }
  expect(ready(), isTrue);
}

void main() {
  late SharedPreferencesDeletionHandoffs handoffs;
  late Authentication authentication;
  late Repository repository;
  late Cleanup cleanup;
  late AccountDeletionController controller;
  late int generated;
  DeletionAuthentication input() => DeletionAuthentication(
    ReauthenticationProvider.password,
    password: 'ephemeral-password',
  );
  AccountDeletionController create({DeletionHandoffStore? store}) =>
      AccountDeletionController(
        scope: (owner: alice, environment: environment),
        repository: repository,
        authentication: authentication,
        handoffs: store ?? handoffs,
        cleanup: cleanup,
        newId: () => CommandId('delete-${++generated}'),
      );
  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
    handoffs = SharedPreferencesDeletionHandoffs();
    authentication = Authentication();
    repository = Repository(authentication);
    cleanup = Cleanup(handoffs);
    generated = 0;
    controller = create();
  });
  tearDown(() {
    controller.dispose();
    SharedPreferencesAsyncPlatform.instance = null;
  });
  Future<DeletionHandoff?> marker() => handoffs.read(alice, environment);

  test('failed sign-out after local erasure preserves a durable accepted retry without claiming files remain', () async {
    authentication.signOutFailure = StateError('sensitive-auth-token');
    await controller.submit(confirmation, input());
    expect(controller.state.phase.name, 'signOutRequired');
    expect((await marker())!.accepted, isTrue);
    expect(cleanup.owners, [alice]);
    authentication.signOutFailure = null;
    await controller.retryCleanup();
    expect(cleanup.owners, [alice]);
    expect(authentication.signedOut, [alice]);
    expect(await marker(), isNull);
    expect(repository.ids, [CommandId('delete-1')]);
  });

  test(
    'state observation cannot lose a change triggered by its initial snapshot',
    () async {
      final states = <DeletionState>[];
      final subscription = controller.watch().listen((state) {
        states.add(state);
        if (states.length == 1) {
          unawaited(
            controller.submit(
              const DeletionConfirmation(acknowledged: false, text: 'DELETE'),
              input(),
            ),
          );
        }
      });
      await Future<void>.delayed(Duration.zero);
      await subscription.cancel();
      expect(
        states.map((s) => s.failure),
        contains(DeletionFailureCode.confirmation),
      );
    },
  );

  test('root disposal before verification finishes prevents a new destructive request', () async {
    authentication.held = Completer<void>();
    final pending = controller.submit(confirmation, input());
    await spinUntil(() => authentication.verified == 1);
    controller.dispose();
    authentication.held!.complete();
    await pending;
    expect(repository.ids, isEmpty);
    expect(cleanup.owners, isEmpty);
    expect(await marker(), isNull);
  });
  test(
    'root disposal after dispatch still finishes captured acceptance safely',
    () async {
      repository.held = Completer<DeletionView>();
      final pending = controller.submit(confirmation, input());
      await spinUntil(() => repository.ids.isNotEmpty);
      controller.dispose();
      repository.held!.complete(
        DeletionView(
          alice,
          DeletionStatus.pending,
          DeletionStep.revokeSessions,
        ),
      );
      await pending;
      expect(cleanup.owners, [alice]);
      expect(await marker(), isNull);
    },
  );
  test('a restarted accepted marker needs no password and leaves signed-in Bob untouched', () async {
    await handoffs.write(
      DeletionHandoff(
        owner: alice,
        environment: environment,
        requestId: CommandId('accepted-before-restart'),
        phase: DeletionHandoffPhase.accepted,
      ),
    );
    authentication.active = bob;
    await controller.retryCleanup();
    expect(cleanup.owners, [alice]);
    expect(authentication.verified, 0);
    expect(repository.ids, isEmpty);
    expect(authentication.signedOut, isEmpty);
  });
  test(
    'a foreign repository response stays uncertain and cannot purge Alice',
    () async {
      repository.held = Completer<DeletionView>()
        ..complete(
          DeletionView(
            bob,
            DeletionStatus.pending,
            DeletionStep.revokeSessions,
          ),
        );
      await controller.submit(confirmation, input());
      expect(controller.state.phase, DeletionPhase.uncertain);
      expect(controller.state.failure, DeletionFailureCode.invalidResponse);
      expect((await marker())!.accepted, isFalse);
      expect(cleanup.owners, isEmpty);
    },
  );
  test('a server recent-login rejection can reauthenticate and retry the same original ID', () async {
    repository.failure = const DeletionFailure(DeletionFailureCode.recentLogin);
    await controller.submit(confirmation, input());
    expect(controller.state.failure, DeletionFailureCode.recentLogin);
    repository.failure = null;
    await controller.submit(confirmation, input());
    expect(authentication.verified, 2);
    expect(repository.ids, [CommandId('delete-1'), CommandId('delete-1')]);
    expect(generated, 1);
  });

  test('production root factory captures raw repository, reauthentication, and cleanup without a private scope', () async {
    final root = ProviderContainer(
      overrides: [
        accountDeletionRepositoryFactoryProvider.overrideWithValue((owner) {
          expect(owner, alice);
          return repository;
        }),
        recentAuthenticationFactoryProvider.overrideWithValue((owner) {
          expect(owner, alice);
          return authentication;
        }),
        deletionHandoffStoreProvider.overrideWithValue(handoffs),
        ownerLocalCleanupProvider.overrideWithValue(cleanup),
        syncEnvironmentProvider.overrideWithValue(environment),
      ],
    );
    addTearDown(root.dispose);
    final flow = root.read(
      accountDeletionControllerProvider((
        owner: alice,
        environment: environment,
      )),
    );
    await flow.submit(confirmation, input());
    expect(cleanup.owners, [alice]);
    expect(flow.state.phase, DeletionPhase.localComplete);
    expect(repository.ids, hasLength(1));
    expect((await marker()), isNull);
  });
  test(
    'root factory refuses a foreign environment instead of opening its data',
    () {
      final root = ProviderContainer(
        overrides: [
          accountDeletionRepositoryFactoryProvider.overrideWithValue(
            (_) => repository,
          ),
          recentAuthenticationFactoryProvider.overrideWithValue(
            (_) => authentication,
          ),
          deletionHandoffStoreProvider.overrideWithValue(handoffs),
          ownerLocalCleanupProvider.overrideWithValue(cleanup),
          syncEnvironmentProvider.overrideWithValue(environment),
        ],
      );
      addTearDown(root.dispose);
      expect(
        () => root.read(accountDeletionControllerFactoryProvider)((
          owner: alice,
          environment: 'production-other',
        )),
        throwsA(
          isA<DeletionFailure>().having(
            (e) => e.code,
            'code',
            DeletionFailureCode.recovery,
          ),
        ),
      );
      expect(cleanup.owners, isEmpty);
    },
  );

  for (final invalid in [
    const DeletionConfirmation(acknowledged: false, text: 'DELETE'),
    const DeletionConfirmation(acknowledged: true, text: 'delete'),
    const DeletionConfirmation(acknowledged: true, text: ' DELETE'),
  ]) {
    test(
      'invalid confirmation ${invalid.acknowledged}/${invalid.text} makes no authentication or destructive call',
      () async {
        final secret = input();
        await controller.submit(invalid, secret);
        expect(authentication.verified, 0);
        expect(repository.ids, isEmpty);
        expect(cleanup.owners, isEmpty);
        expect(await marker(), isNull);
        expect(secret.hasSecret, isFalse);
        expect(controller.state.failure, DeletionFailureCode.confirmation);
      },
    );
  }
  test('wrong password never persists a request or purges data', () async {
    authentication.failure = const DeletionFailure(
      DeletionFailureCode.credentials,
    );
    await controller.submit(confirmation, input());
    expect(controller.state.phase, DeletionPhase.authenticationFailed);
    expect(controller.state.failure, DeletionFailureCode.credentials);
    expect(repository.ids, isEmpty);
    expect(await marker(), isNull);
    expect(cleanup.owners, isEmpty);
  });
  test('owner changes during reauthentication prevent the request even if the provider returns successfully', () async {
    authentication.held = Completer<void>();
    final pending = controller.submit(confirmation, input());
    await spinUntil(() => authentication.verified == 1);
    authentication.active = bob;
    authentication.held!.complete();
    await pending;
    expect(repository.ids, isEmpty);
    expect(cleanup.owners, isEmpty);
    expect(controller.state.failure, DeletionFailureCode.changedOwner);
    expect(controller.visibleState(bob), isNull);
  });
  test('acceptance is durable before cleanup and reports server pending rather than complete', () async {
    cleanup.held = Completer<void>();
    final secret = input();
    final pending = controller.submit(confirmation, secret);
    await spinUntil(() => cleanup.owners.isNotEmpty);
    expect((await marker())!.accepted, isTrue);
    expect(secret.hasSecret, isFalse);
    expect(controller.state.phase, DeletionPhase.cleaning);
    expect(controller.state.view!.status, DeletionStatus.pending);
    cleanup.held!.complete();
    await pending;
    expect(controller.state.phase, DeletionPhase.localComplete);
    expect(authentication.signedOut, [alice]);
    expect(await marker(), isNull);
  });
  test('offline or lost response preserves local drafts and one uncertain identity', () async {
    repository.failure = StateError('lost response credential must not escape');
    await controller.submit(confirmation, input());
    expect(controller.state.phase, DeletionPhase.uncertain);
    expect(controller.state.failure, DeletionFailureCode.unavailable);
    expect((await marker())!.phase, DeletionHandoffPhase.uncertain);
    expect(cleanup.owners, isEmpty);
    expect(authentication.signedOut, isEmpty);
    expect(generated, 1);
  });
  test(
    'retry without an existing server job replays the original request ID',
    () async {
      repository.failure = const DeletionFailure(
        DeletionFailureCode.unavailable,
      );
      await controller.submit(confirmation, input());
      repository.failure = null;
      await controller.retryOriginal();
      expect(repository.statusCalls, 1);
      expect(repository.ids, [CommandId('delete-1'), CommandId('delete-1')]);
      expect(generated, 1);
      expect(cleanup.owners, [alice]);
    },
  );
  test('retry of a lost accepted response verifies status without submitting again', () async {
    repository.failure = const DeletionFailure(DeletionFailureCode.unavailable);
    await controller.submit(confirmation, input());
    repository.existing = DeletionView(
      alice,
      DeletionStatus.leased,
      DeletionStep.storage,
    );
    await controller.retryOriginal();
    expect(repository.ids, [CommandId('delete-1')]);
    expect(cleanup.owners, [alice]);
    expect(controller.state.view!.status, DeletionStatus.leased);
  });
  test(
    'restarted uncertain flow uses its saved ID and never retries under Bob',
    () async {
      await handoffs.write(
        DeletionHandoff(
          owner: alice,
          environment: environment,
          requestId: CommandId('original-before-restart'),
          phase: DeletionHandoffPhase.uncertain,
        ),
      );
      authentication.active = bob;
      await controller.retryOriginal();
      expect(repository.ids, isEmpty);
      expect(cleanup.owners, isEmpty);
      expect((await marker())!.requestId, CommandId('original-before-restart'));
      authentication.active = alice;
      repository.requireVerification = false;
      await controller.retryOriginal();
      expect(repository.ids, [CommandId('original-before-restart')]);
      expect(generated, 0);
    },
  );
  test('acceptance after replacement UID purges only captured Alice and never signs Bob out', () async {
    repository.held = Completer<DeletionView>();
    final pending = controller.submit(confirmation, input());
    await spinUntil(() => repository.ids.isNotEmpty);
    authentication.active = bob;
    repository.held!.complete(
      DeletionView(alice, DeletionStatus.pending, DeletionStep.revokeSessions),
    );
    await pending;
    expect(cleanup.owners, [alice]);
    expect(authentication.signedOut, isEmpty);
    expect(authentication.active, bob);
    expect(controller.visibleState(bob), isNull);
  });
  test('owner changes during cleanup preserve replacement login', () async {
    cleanup.held = Completer<void>();
    final pending = controller.submit(confirmation, input());
    await spinUntil(() => cleanup.owners.isNotEmpty);
    authentication.active = bob;
    cleanup.held!.complete();
    await pending;
    expect(authentication.active, bob);
    expect(authentication.signedOut, isEmpty);
  });
  test('accepted cleanup failure retains recovery and retry never requests a new job', () async {
    cleanup.fail = true;
    await controller.submit(confirmation, input());
    expect(controller.state.phase, DeletionPhase.cleanupRequired);
    expect(controller.state.failure, DeletionFailureCode.localCleanup);
    expect((await marker())!.accepted, isTrue);
    cleanup.fail = false;
    await controller.retryCleanup();
    expect(repository.ids, [CommandId('delete-1')]);
    expect(authentication.verified, 1);
    expect(controller.state.phase, DeletionPhase.localComplete);
    expect(await marker(), isNull);
  });
  test('acceptance storage failure prevents purge until that same acceptance is persisted', () async {
    final failing = FailingHandoffs(handoffs);
    controller.dispose();
    controller = create(store: failing);
    await controller.submit(confirmation, input());
    expect(controller.state.phase, DeletionPhase.cleanupRequired);
    expect(cleanup.owners, isEmpty);
    expect((await marker())!.phase, DeletionHandoffPhase.uncertain);
    failing.failAcceptance = false;
    await controller.retryCleanup();
    expect(cleanup.owners, [alice]);
    expect(repository.ids, [CommandId('delete-1')]);
  });
  test(
    'duplicate clicks consume secrets but create only one request',
    () async {
      authentication.held = Completer<void>();
      final pending = controller.submit(confirmation, input());
      await spinUntil(() => authentication.verified == 1);
      final duplicate = input();
      await controller.submit(confirmation, duplicate);
      expect(duplicate.hasSecret, isFalse);
      authentication.held!.complete();
      await pending;
      expect(repository.ids, [CommandId('delete-1')]);
    },
  );
  test('cleanup retry cannot reinterpret uncertainty as acceptance', () async {
    repository.failure = const DeletionFailure(DeletionFailureCode.unavailable);
    await controller.submit(confirmation, input());
    await controller.retryCleanup();
    expect(cleanup.owners, isEmpty);
    expect((await marker())!.accepted, isFalse);
  });
  test('a protected needsRecovery response is accepted but not shown as cloud completion', () async {
    repository.held = Completer<DeletionView>()
      ..complete(
        DeletionView(alice, DeletionStatus.needsRecovery, DeletionStep.storage),
      );
    await controller.submit(confirmation, input());
    expect(controller.state.phase, DeletionPhase.localComplete);
    expect(controller.state.view!.status, DeletionStatus.needsRecovery);
    expect(cleanup.owners, [alice]);
  });
  test('root handoff outlives private profile scope and does not publish into Bob controller', () async {
    repository.held = Completer<DeletionView>();
    final root = ProviderContainer(
      overrides: [
        accountDeletionControllerFactoryProvider.overrideWithValue(
          (scope) => create(),
        ),
      ],
    );
    addTearDown(root.dispose);
    final scope = (owner: alice, environment: environment);
    final child = ProviderContainer(
      parent: root,
      overrides: [ownerUidProvider.overrideWithValue(alice)],
    );
    final rootFlow = root.read(accountDeletionControllerProvider(scope));
    expect(
      child.read(accountDeletionControllerProvider(scope)),
      same(rootFlow),
    );
    final pending = rootFlow.submit(confirmation, input());
    await spinUntil(() => repository.ids.isNotEmpty);
    child.dispose();
    authentication.active = bob;
    repository.held!.complete(
      DeletionView(alice, DeletionStatus.pending, DeletionStep.revokeSessions),
    );
    await pending;
    expect(cleanup.owners, [alice]);
    expect(rootFlow.visibleState(bob), isNull);
    expect(authentication.signedOut, isEmpty);
  });
}
