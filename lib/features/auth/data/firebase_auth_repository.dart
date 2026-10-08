import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../domain/auth_repository.dart';
import 'auth_failure.dart';
import 'auth_mutation_gate.dart';
import 'native_google_authentication.dart';

final class FirebaseAuthRepository implements AuthRepository {
  FirebaseAuthRepository(
    this.auth, {
    this.nativeGoogle = const OfficialNativeGoogleAuthentication(),
  });
  final FirebaseAuth auth;
  final NativeGoogleAuthentication nativeGoogle;

  @override
  Stream<AuthIdentity?> watchIdentity() => auth.authStateChanges().map(
    (user) => user == null
        ? null
        : AuthIdentity(
            OwnerUid(user.uid),
            displayName: user.displayName,
            email: user.email,
          ),
  );

  Future<void> _guard(Future<void> Function() operation) async {
    try {
      await authMutationGate(auth).run(operation);
    } catch (error) {
      throw authFailure(error);
    }
  }

  @override
  Future<void> signInWithEmail(String email, String password) =>
      _guard(() async {
        await auth.signInWithEmailAndPassword(
          email: email.trim(),
          password: password,
        );
      });
  @override
  Future<void> createAccount(String email, String password) => _guard(() async {
    await auth.createUserWithEmailAndPassword(
      email: email.trim(),
      password: password,
    );
  });
  @override
  Future<void> signInWithGoogle() => _guard(() async {
    final provider = GoogleAuthProvider();
    if (kIsWeb) {
      await auth.signInWithPopup(provider);
    } else {
      await nativeGoogle.initialize();
      final credential = await nativeGoogle.credential();
      await auth.signInWithCredential(credential);
    }
  });
  @override
  Future<void> resetPassword(String email) => _guard(() async {
    try {
      await auth.sendPasswordResetEmail(email: email.trim());
    } on FirebaseAuthException catch (error) {
      // Neutral response regardless of whether a matching account exists.
      if (error.code != 'user-not-found') rethrow;
    }
  });
  @override
  Future<void> signOut() => _guard(auth.signOut);
}
