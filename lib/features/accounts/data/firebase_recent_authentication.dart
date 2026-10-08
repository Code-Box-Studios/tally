import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../auth/data/native_google_authentication.dart';
import '../../auth/data/auth_mutation_gate.dart';
import '../domain/account_deletion.dart';

final class FirebaseRecentAuthentication implements RecentAuthentication {
  const FirebaseRecentAuthentication({
    required this.owner,
    required this.auth,
    this.web = kIsWeb,
    this.nativeGoogle = const OfficialNativeGoogleAuthentication(),
  });
  final OwnerUid owner;
  final FirebaseAuth auth;
  final bool web;
  final NativeGoogleAuthentication nativeGoogle;
  @override
  Set<ReauthenticationProvider> get providers {
    if (!isOwnerActive(owner)) return const {};
    return Set.unmodifiable(
      auth.currentUser!.providerData
          .map(
            (value) => switch (value.providerId) {
              'password' => ReauthenticationProvider.password,
              'google.com' => ReauthenticationProvider.google,
              _ => null,
            },
          )
          .whereType<ReauthenticationProvider>(),
    );
  }

  @override
  bool isOwnerActive(OwnerUid owner) =>
      owner == this.owner && auth.currentUser?.uid == owner.value;
  User _check(OwnerUid owner) {
    if (!isOwnerActive(owner)) {
      throw const DeletionFailure(DeletionFailureCode.changedOwner);
    }
    return auth.currentUser!;
  }

  @override
  Future<void> reauthenticate(
    OwnerUid owner, {
    String? password,
    ReauthenticationProvider? provider,
  }) => authMutationGate(
    auth,
  ).run(() => _reauthenticate(owner, password: password, provider: provider));

  Future<void> _reauthenticate(
    OwnerUid owner, {
    String? password,
    ReauthenticationProvider? provider,
  }) async {
    try {
      final user = _check(owner);
      if (provider == null || !providers.contains(provider)) {
        throw const DeletionFailure(DeletionFailureCode.credentials);
      }
      UserCredential result;
      if (provider == ReauthenticationProvider.password) {
        if (password == null || password.isEmpty || user.email == null) {
          throw const DeletionFailure(DeletionFailureCode.credentials);
        }
        result = await user.reauthenticateWithCredential(
          EmailAuthProvider.credential(email: user.email!, password: password),
        );
        _check(owner);
      } else if (web) {
        result = await user.reauthenticateWithPopup(GoogleAuthProvider());
        _check(owner);
      } else {
        await nativeGoogle.initialize();
        _check(owner);
        final credential = await nativeGoogle.credential();
        _check(owner);
        result = await user.reauthenticateWithCredential(credential);
        _check(owner);
      }
      if (result.user?.uid != owner.value) {
        throw const DeletionFailure(DeletionFailureCode.changedOwner);
      }
      _check(owner);
      final token = await user.getIdToken(true);
      _check(owner);
      if (token == null || token.isEmpty) {
        throw const DeletionFailure(DeletionFailureCode.unavailable);
      }
    } catch (error) {
      if (error is DeletionFailure) rethrow;
      if (!isOwnerActive(owner)) {
        throw const DeletionFailure(DeletionFailureCode.changedOwner);
      }
      final code = error is FirebaseAuthException
          ? error.code
          : error is GoogleSignInException
          ? error.code.name
          : '';
      throw DeletionFailure(switch (code) {
        'wrong-password' ||
        'invalid-credential' ||
        'user-not-found' => DeletionFailureCode.credentials,
        'user-mismatch' => DeletionFailureCode.changedOwner,
        'popup-closed-by-user' ||
        'canceled' ||
        'cancelled' => DeletionFailureCode.cancelled,
        'popup-blocked' => DeletionFailureCode.popupBlocked,
        'requires-recent-login' => DeletionFailureCode.recentLogin,
        _ => DeletionFailureCode.unavailable,
      });
    }
  }

  @override
  Future<void> signOutIfOwner(OwnerUid owner) =>
      authMutationGate(auth).run(() async {
        if (!isOwnerActive(owner)) return;
        try {
          await auth.signOut();
        } catch (_) {
          throw const DeletionFailure(DeletionFailureCode.unavailable);
        }
      });
}
