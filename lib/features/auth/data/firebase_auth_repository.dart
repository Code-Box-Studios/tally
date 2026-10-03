import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../domain/auth_repository.dart';
import 'auth_failure.dart';

final class FirebaseAuthRepository implements AuthRepository {
  FirebaseAuthRepository(this.auth);
  final FirebaseAuth auth;
  static Future<void>? _nativeGoogleInitialization;

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
      await operation();
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
      const clientId = String.fromEnvironment('TALLY_GOOGLE_IOS_CLIENT_ID');
      const serverClientId = String.fromEnvironment(
        'TALLY_GOOGLE_WEB_CLIENT_ID',
      );
      await (_nativeGoogleInitialization ??= GoogleSignIn.instance.initialize(
        clientId: clientId.isEmpty ? null : clientId,
        serverClientId: serverClientId.isEmpty ? null : serverClientId,
      ));
      final account = await GoogleSignIn.instance.authenticate();
      final credential = GoogleAuthProvider.credential(
        idToken: account.authentication.idToken,
      );
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
