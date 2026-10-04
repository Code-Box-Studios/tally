import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../data/firebase_auth_repository.dart';
import '../data/firebase_profile_repository.dart';
import '../domain/auth_repository.dart';
import '../domain/session_state.dart';
import '../domain/user_profile.dart';
import 'session_controller.dart';

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => FirebaseAuthRepository(ref.watch(firebaseClientsProvider).auth),
);
final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  final clients = ref.watch(firebaseClientsProvider);
  return FirebaseProfileRepository(clients.firestore, clients.functions);
});
final sessionControllerProvider = Provider<SessionController>((ref) {
  final controller = SessionController(
    ref.watch(authRepositoryProvider),
    ref.watch(profileRepositoryProvider),
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
