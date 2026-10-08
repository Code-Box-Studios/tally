import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';

abstract interface class NativeGoogleAuthentication {
  Future<void> initialize();
  Future<AuthCredential> credential();
}

final class OfficialNativeGoogleAuthentication
    implements NativeGoogleAuthentication {
  const OfficialNativeGoogleAuthentication();
  static Future<void>? _initialization;
  @override
  Future<void> initialize() {
    const clientId = String.fromEnvironment('TALLY_GOOGLE_IOS_CLIENT_ID');
    const serverClientId = String.fromEnvironment('TALLY_GOOGLE_WEB_CLIENT_ID');
    return _initialization ??= GoogleSignIn.instance.initialize(
      clientId: clientId.isEmpty ? null : clientId,
      serverClientId: serverClientId.isEmpty ? null : serverClientId,
    );
  }

  @override
  Future<AuthCredential> credential() async {
    final account = await GoogleSignIn.instance.authenticate();
    return GoogleAuthProvider.credential(
      idToken: account.authentication.idToken,
    );
  }
}
