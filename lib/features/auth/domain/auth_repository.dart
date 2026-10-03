import '../../../core/identifiers/entity_ids.dart';
import 'user_profile.dart';

final class AuthIdentity {
  const AuthIdentity(this.uid, {this.displayName, this.email});
  final OwnerUid uid;
  final String? displayName;
  final String? email;
}

abstract interface class AuthRepository {
  Stream<AuthIdentity?> watchIdentity();
  Future<void> signInWithEmail(String email, String password);
  Future<void> createAccount(String email, String password);
  Future<void> signInWithGoogle();
  Future<void> resetPassword(String email);
  Future<void> signOut();
}

abstract interface class ProfileRepository {
  Future<UserProfile> bootstrap(OwnerUid owner);
  Stream<UserProfile> watchProfile(OwnerUid owner);
  Future<UserProfile> update(
    ProfilePreferences preferences, {
    required OwnerUid owner,
    required int expectedRevision,
    required CommandId commandId,
  });
}
