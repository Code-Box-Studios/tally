import 'dart:async';

import 'package:flutter/foundation.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/config/environment_providers.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../data/firebase_auth_repository.dart';
import '../data/firebase_profile_repository.dart';
import '../data/offline_profile_repository.dart';
import '../data/profile_snapshot_store.dart';
import '../../sync/data/trusted_device_store.dart';
import '../domain/auth_repository.dart';
import '../domain/session_state.dart';
import '../domain/user_profile.dart';
import 'session_controller.dart';

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => FirebaseAuthRepository(ref.watch(firebaseClientsProvider).auth),
);
final profileSnapshotStoreProvider = Provider<ProfileSnapshotStore>(
  (_) => SharedPreferencesProfileSnapshots(),
);
final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  final clients = ref.watch(firebaseClientsProvider);
  final config = ref.watch(environmentProvider);
  final environment =
      '${config.mode.name}-${config.projectId ?? 'unconfigured'}';
  final trusted = SharedPreferencesTrustedDeviceStore();
  return OfflineProfileRepository(
    canonical: FirebaseProfileRepository(clients.firestore, clients.functions),
    snapshots: ref.watch(profileSnapshotStoreProvider),
    environment: environment,
    canUseSnapshot: (owner) =>
        kIsWeb ? trusted.read(owner, environment) : Future.value(true),
  );
});
final sessionControllerProvider = Provider<SessionController>((ref) {
  final controller = SessionController(
    ref.watch(authRepositoryProvider),
    ref.watch(profileRepositoryProvider),
    reportFailure: kDebugMode
        ? (messageKey) => debugPrint('Tally session unavailable ($messageKey).')
        : null,
  );
  ref.onDispose(() => unawaited(controller.dispose()));
  return controller;
});
final sessionStateProvider = StreamProvider<SessionState>(
  (ref) => ref.watch(sessionControllerProvider).watch(),
);
final ownerUidProvider = Provider<OwnerUid>(
  (ref) => throw StateError('A private owner scope is required.'),
  dependencies: [],
);
final userProfileProvider = Provider<UserProfile>(
  (ref) => throw StateError('A private owner scope is required.'),
  dependencies: [],
);
