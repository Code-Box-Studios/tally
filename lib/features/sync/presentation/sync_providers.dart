import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/environment_providers.dart';
import '../../../core/firebase/firebase_providers.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/data/owner_command_gateway.dart';
import '../../../shared/domain/data_page.dart';
import '../../../shared/domain/financial_failure.dart';
import '../../../shared/presentation/owner_gateways.dart';
import '../../../shared/presentation/private_session_cleanup_provider.dart';
import '../../auth/presentation/auth_providers.dart';
import '../data/cached_payment_resource.dart';
import '../data/command_result_validation.dart';
import '../data/durable_owner_commands.dart';
import '../data/firebase_command_transport.dart';
import '../data/guarded_owner_commands.dart';
import '../data/outbox_open.dart';
import '../data/trusted_device_store.dart';
import '../domain/command_dependencies.dart';
import '../domain/outbox_entry.dart';
import '../domain/outbox_store.dart';
import '../domain/sync_capability.dart';
import '../domain/sync_engine.dart';

const _changedOwner = FinancialFailure(
  FinancialFailureCode.signIn,
  'Sign in to the same account to sync your changes.',
);

/// One runtime owns one UID/environment, including late-opening cleanup.
final class SyncRuntime {
  SyncRuntime({
    required this.owner,
    required this.capability,
    required this.gateway,
    this.store,
    this.engine,
  }) {
    if (gateway.owner != owner ||
        store != null && store!.owner != owner ||
        engine != null && engine!.owner != owner ||
        capability.canQueue != (store != null && engine != null)) {
      throw ArgumentError('Invalid sync ownership or storage capability.');
    }
  }
  final OwnerUid owner;
  final SyncCapability capability;
  final OwnerCommandGateway gateway;
  final OutboxStore? store;
  final SyncEngine? engine;
  bool _disposed = false;
  Future<void>? _closing;
  bool get isDisposed => _disposed;
  Future<void> dispose() => _closing ??= (() async {
    _disposed = true;
    await engine?.dispose();
    await store?.close();
  })();
}

final class DeferredOwnerCommands implements OwnerCommandGateway {
  const DeferredOwnerCommands(this.owner, this._runtime, this._active);
  @override
  final OwnerUid owner;
  final Future<SyncRuntime> Function() _runtime;
  final bool Function() _active;
  @override
  Future<Map<String, Object?>> call(
    String name,
    CommandId id,
    Map<String, Object?> payload,
  ) async {
    if (!_active()) throw _changedOwner;
    final runtime = await _runtime();
    if (!_active() || runtime.isDisposed || runtime.owner != owner) {
      throw _changedOwner;
    }
    final result = await runtime.gateway.call(name, id, payload);
    if (!_active() || runtime.isDisposed) throw _changedOwner;
    return result;
  }
}

typedef SyncRuntimeFactory = Future<SyncRuntime> Function(
  OwnerUid owner,
  String environment,
  bool trusted,
  OwnerCommandGateway raw,
  bool Function() active,
);
final syncRuntimeFactoryProvider = Provider<SyncRuntimeFactory>((ref) {
  final clients = ref.watch(firebaseClientsProvider);
  return (owner, environment, trusted, raw, scopeActive) async {
    bool active() =>
        scopeActive() && clients.auth.currentUser?.uid == owner.value;
    final guarded = GuardedOwnerCommands(raw: raw, isOwnerActive: active);
    final opened = await openOutbox(
      owner: owner,
      environmentKey: environment,
      trustedDevice: trusted,
    );
    if (!active()) {
      await opened.store?.close();
      throw _changedOwner;
    }
    if (!opened.capability.canQueue || opened.store == null) {
      return SyncRuntime(
        owner: owner,
        capability: opened.capability,
        gateway: guarded,
      );
    }
    final store = opened.store!;
    final transport = FirebaseCommandTransport(
      owner: owner,
      isOwnerActive: active,
      invoke: (name, envelope) async =>
          (await clients.functions.httpsCallable(name).call<Object?>(envelope))
              .data,
    );
    final engine = SyncEngine(
      store: store,
      transport: transport,
      validateResult: validateCommandResult,
    );
    return SyncRuntime(
      owner: owner,
      capability: opened.capability,
      store: store,
      engine: engine,
      gateway: DurableOwnerCommands(
        raw: guarded,
        engine: engine,
        dependencies: CommandDependencies(
          store: store,
          cachedPaymentObligation: (id) =>
              cachedPaymentResource(clients.firestore, owner, id),
        ),
      ),
    );
  };
});
final trustedDeviceStoreProvider = Provider<TrustedDeviceStore>(
  (ref) => SharedPreferencesTrustedDeviceStore(),
);
final syncEnvironmentProvider = Provider<String>((ref) {
  final config = ref.watch(environmentProvider);
  return '${config.mode.name}-${config.projectId ?? 'unconfigured'}';
});
final trustedDeviceChoiceProvider = FutureProvider<bool>((ref) {
  final owner = ref.watch(ownerUidProvider);
  if (!kIsWeb) return Future.value(true);
  return ref
      .watch(trustedDeviceStoreProvider)
      .read(owner, ref.watch(syncEnvironmentProvider));
}, dependencies: [ownerUidProvider]);
final setTrustedDeviceProvider = Provider<Future<void> Function(bool)>(
  (ref) {
    final owner = ref.watch(ownerUidProvider),
        environment = ref.watch(syncEnvironmentProvider),
        store = ref.watch(trustedDeviceStoreProvider);
    return (trusted) async {
      if (trusted && ref.mounted) {
        final profile = ref.read(userProfileProvider);
        if (profile.uid != owner) throw _changedOwner;
        await ref
            .read(profileSnapshotStoreProvider)
            .write(profile, environment);
      }
      await store.write(owner, environment, trusted);
      if (ref.mounted) ref.invalidate(trustedDeviceChoiceProvider);
    };
  },
  dependencies: [
    ownerUidProvider,
    userProfileProvider,
    trustedDeviceChoiceProvider,
  ],
);

final syncRuntimeProvider = FutureProvider<SyncRuntime>(
  (ref) async {
    final owner = ref.watch(ownerUidProvider),
        raw = ref.watch(rawOwnerCommandGatewayProvider),
        environment = ref.watch(syncEnvironmentProvider),
        factory = ref.watch(syncRuntimeFactoryProvider);
    SyncRuntime? current;
    void Function()? unregisterCleanup;
    var disposed = false;
    ref.onDispose(() {
      disposed = true;
      unregisterCleanup?.call();
      unawaited(current?.dispose());
    });
    final trusted = await ref.watch(trustedDeviceChoiceProvider.future);
    if (!ref.mounted) throw _changedOwner;
    final runtime = await factory(
      owner,
      environment,
      trusted,
      raw,
      () => ref.mounted && !disposed,
    );
    if (!ref.mounted || disposed) {
      await runtime.dispose();
      throw _changedOwner;
    }
    current = runtime;
    unregisterCleanup = ref
        .read(privateSessionCleanupProvider)
        .register(owner, runtime.dispose);
    return runtime;
  },
  dependencies: [
    ownerUidProvider,
    rawOwnerCommandGatewayProvider,
    trustedDeviceChoiceProvider,
  ],
);
final outboxStoreProvider = Provider<OutboxStore?>(
  (ref) => ref.watch(syncRuntimeProvider).value?.store,
  dependencies: [syncRuntimeProvider],
);
final syncEngineProvider = Provider<SyncEngine?>(
  (ref) => ref.watch(syncRuntimeProvider).value?.engine,
  dependencies: [syncRuntimeProvider],
);
final pendingActionsProvider = StreamProvider<DataPage<OutboxEntry>>((
  ref,
) async* {
  final runtime = await ref.watch(syncRuntimeProvider.future);
  if (!ref.mounted) return;
  if (runtime.store == null) {
    yield DataPage(
      items: const <OutboxEntry>[],
      nextCursor: null,
      hasMore: false,
      isFromCache: true,
    );
    return;
  }
  yield* runtime.store!.watch(limit: 1000, unresolvedOnly: true);
}, dependencies: [syncRuntimeProvider]);
final syncHistoryProvider = StreamProvider<DataPage<OutboxEntry>>((ref) async* {
  final runtime = await ref.watch(syncRuntimeProvider.future);
  if (!ref.mounted || runtime.store == null) return;
  yield* runtime.store!.watch(limit: 100);
}, dependencies: [syncRuntimeProvider]);
final outboxCommandProvider = FutureProvider.autoDispose
    .family<OutboxEntry?, CommandId>((ref, id) async {
      ref.watch(pendingActionsProvider);
      final runtime = await ref.watch(syncRuntimeProvider.future);
      return runtime.store?.get(id);
    }, dependencies: [syncRuntimeProvider, pendingActionsProvider]);
