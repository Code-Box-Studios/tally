import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/features/auth/data/firebase_auth_repository.dart';

import '../accounts/firebase_recent_authentication_test.dart' show Google;

final class Auth extends Fake implements FirebaseAuth {
  final credentials = <AuthCredential>[];
  @override
  Future<UserCredential> signInWithCredential(AuthCredential credential) async {
    credentials.add(credential);
    return Result();
  }
}

final class Result extends Fake implements UserCredential {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('ordinary native sign-in uses the same Google initialization port as reauthentication', () async {
    final google = Google(), auth = Auth();
    await FirebaseAuthRepository(auth, nativeGoogle: google).signInWithGoogle();
    expect(google.initializations, 1);
    expect(google.credentials, 1);
    expect(auth.credentials.single.providerId, 'google.com');
  });
}
