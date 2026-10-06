import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/identifiers/command_id_factory.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../data/auth_failure.dart';
import '../domain/user_profile.dart';
import 'auth_providers.dart';
import '../../../shared/presentation/private_session_cleanup_provider.dart';

final authActionsProvider = AsyncNotifierProvider<AuthActions, void>(
  AuthActions.new,
);

class AuthActions extends AsyncNotifier<void> {
  @override
  void build() {}
  Future<bool> _run(Future<void> Function() action) async {
    if (state.isLoading) return false;
    state = const AsyncLoading();
    try {
      await action();
      if (ref.mounted) state = const AsyncData(null);
      return true;
    } catch (error, stack) {
      if (ref.mounted) state = AsyncError(authFailure(error), stack);
      return false;
    }
  }

  Future<bool> submit(String email, String password, {required bool create}) =>
      _run(() {
        final repository = ref.read(authRepositoryProvider);
        return create
            ? repository.createAccount(email, password)
            : repository.signInWithEmail(email, password);
      });
  Future<bool> google() =>
      _run(ref.read(authRepositoryProvider).signInWithGoogle);
  Future<bool> reset(String email) =>
      _run(() => ref.read(authRepositoryProvider).resetPassword(email));
  Future<bool> signOut() => _run(() async {
    final controller = ref.read(sessionControllerProvider),
        owner = controller.identity?.uid;
    if (owner != null) {
      await ref.read(privateSessionCleanupProvider).prepareSignOut(owner);
    }
    await controller.signOut();
  });
}

final profileActionsProvider =
    AsyncNotifierProvider.autoDispose<ProfileActions, void>(ProfileActions.new);

class ProfileActions extends AsyncNotifier<void> {
  CommandId? _commandId;
  String? _fingerprint;
  @override
  void build() {}
  Future<bool> save(UserProfile profile, ProfilePreferences preferences) async {
    if (state.isLoading) return false;
    final fingerprint =
        '${profile.uid.value}:${profile.revision}:${preferences.currency.code}:${preferences.timezone}:${preferences.theme.name}:${preferences.onboardingComplete}';
    if (_fingerprint != fingerprint) {
      _fingerprint = fingerprint;
      _commandId = newCommandId();
    }
    state = const AsyncLoading();
    try {
      await ref
          .read(profileRepositoryProvider)
          .update(
            preferences,
            owner: profile.uid,
            expectedRevision: profile.revision,
            commandId: _commandId!,
          );
      if (ref.mounted) state = const AsyncData(null);
      return true;
    } catch (error, stack) {
      if (ref.mounted) state = AsyncError(authFailure(error), stack);
      return false;
    }
  }
}
