import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/accounts/data/firebase_recent_authentication.dart';
import 'package:tally/features/accounts/domain/account_deletion.dart';
import 'package:tally/features/auth/data/native_google_authentication.dart';
import 'package:tally/features/auth/data/firebase_auth_repository.dart';

final class TestAuth extends Fake implements FirebaseAuth {
  TestAuth(this.currentUser);
  @override
  User? currentUser;
  int signOuts = 0;
  Completer<void>? signOutHeld;
  int signIns = 0;
  @override
  Future<UserCredential> signInWithEmailAndPassword({
    required String email,
    required String password,
  }) async {
    signIns++;
    currentUser = TestUser('bob');
    return Credential(currentUser);
  }

  @override
  Future<void> signOut() async {
    signOuts++;
    await signOutHeld?.future;
    currentUser = null;
  }
}

final class Credential extends Fake implements UserCredential {
  Credential(this.user);
  @override
  final User? user;
}

final class ProviderInfo extends Fake implements UserInfo {
  ProviderInfo(this.providerId);
  @override
  final String providerId;
}

final class TestUser extends Fake implements User {
  TestUser(this.uid, {this.ids = const ['password', 'google.com']});
  @override
  final String uid;
  final List<String> ids;
  @override
  String? get email => 'alice@example.test';
  @override
  List<UserInfo> get providerData => ids.map(ProviderInfo.new).toList();
  final credentials = <AuthCredential>[];
  int popups = 0, refreshes = 0;
  Completer<UserCredential>? reauthHeld;
  Completer<String?>? refreshHeld;
  String? returnedUid;
  Object? failure;
  @override
  Future<UserCredential> reauthenticateWithCredential(
    AuthCredential credential,
  ) async {
    credentials.add(credential);
    if (failure != null) throw failure!;
    return reauthHeld == null
        ? Credential(TestUser(returnedUid ?? uid))
        : await reauthHeld!.future;
  }

  @override
  Future<UserCredential> reauthenticateWithPopup(AuthProvider provider) async {
    expect(provider, isA<GoogleAuthProvider>());
    popups++;
    if (failure != null) throw failure!;
    return Credential(TestUser(returnedUid ?? uid));
  }

  @override
  Future<String?> getIdToken([bool forceRefresh = false]) async {
    expect(forceRefresh, isTrue);
    refreshes++;
    return refreshHeld == null
        ? 'synthetic-token-never-log'
        : await refreshHeld!.future;
  }
}

final class Google extends Fake implements NativeGoogleAuthentication {
  int initializations = 0, credentials = 0;
  Completer<void>? initializationHeld;
  Completer<AuthCredential>? credentialHeld;
  @override
  Future<void> initialize() async {
    initializations++;
    await initializationHeld?.future;
  }

  @override
  Future<AuthCredential> credential() async {
    credentials++;
    return credentialHeld == null
        ? GoogleAuthProvider.credential(idToken: 'fresh-synthetic-google')
        : await credentialHeld!.future;
  }
}

void main() {
  final alice = OwnerUid('alice'), bob = OwnerUid('bob');
  late TestUser user;
  late TestAuth auth;
  late Google google;
  FirebaseRecentAuthentication adapter({bool web = false}) =>
      FirebaseRecentAuthentication(
        owner: alice,
        auth: auth,
        nativeGoogle: google,
        web: web,
      );
  final changed = isA<DeletionFailure>().having(
    (e) => e.code,
    'code',
    DeletionFailureCode.changedOwner,
  );
  setUp(() {
    user = TestUser('alice');
    auth = TestAuth(user);
    google = Google();
  });

  test(
    'an in-flight owner sign-out cannot erase a later application sign-in',
    () async {
      auth.signOutHeld = Completer<void>();
      final deleting = adapter().signOutIfOwner(alice);
      await Future<void>.delayed(Duration.zero);
      final replacement = FirebaseAuthRepository(auth)
          .signInWithEmail('bob@example.test', 'synthetic');
      await Future<void>.delayed(Duration.zero);
      final before = auth.signIns;
      auth.signOutHeld!.complete();
      await Future.wait([deleting, replacement]);
      expect(before, 0);
      expect(auth.currentUser?.uid, 'bob');
    },
  );

  test(
    'offers only linked password and Google providers for the captured owner',
    () {
      expect(adapter().providers, {
        ReauthenticationProvider.password,
        ReauthenticationProvider.google,
      });
      auth.currentUser = TestUser('alice', ids: ['apple.com']);
      expect(adapter().providers, isEmpty);
      auth.currentUser = TestUser('bob');
      expect(adapter().providers, isEmpty);
      expect(adapter().isOwnerActive(alice), isFalse);
    },
  );
  test('email reauthentication uses a credential then forces an owner-checked token refresh', () async {
    await adapter().reauthenticate(
      alice,
      password: 'ephemeral',
      provider: ReauthenticationProvider.password,
    );
    expect(
      user.credentials.single,
      isA<EmailAuthCredential>()
          .having((c) => c.email, 'email', 'alice@example.test')
          .having((c) => c.password, 'password', 'ephemeral'),
    );
    expect(user.refreshes, 1);
  });
  test(
    'web Google uses user reauthentication popup and never native sign-in',
    () async {
      await adapter(web: true)
          .reauthenticate(alice, provider: ReauthenticationProvider.google);
      expect(user.popups, 1);
      expect(user.credentials, isEmpty);
      expect(google.initializations, 0);
      expect(user.refreshes, 1);
    },
  );
  test(
    'native Google gets a fresh credential through shared initialization',
    () async {
      await adapter().reauthenticate(
        alice,
        provider: ReauthenticationProvider.google,
      );
      expect(google.initializations, 1);
      expect(google.credentials, 1);
      expect(user.credentials.single.providerId, 'google.com');
      expect(user.refreshes, 1);
    },
  );
  test('wrong password is sanitized without token refresh', () async {
    user.failure = FirebaseAuthException(
      code: 'wrong-password',
      message: 'sensitive-secret',
    );
    await expectLater(
      adapter().reauthenticate(
        alice,
        password: 'wrong',
        provider: ReauthenticationProvider.password,
      ),
      throwsA(
        isA<DeletionFailure>()
            .having((e) => e.code, 'code', DeletionFailureCode.credentials)
            .having(
              (e) => e.toString(),
              'message',
              isNot(contains('sensitive-secret')),
            ),
      ),
    );
    expect(user.refreshes, 0);
  });
  test('another Google credential UID cannot authorize deletion', () async {
    user.returnedUid = 'bob';
    await expectLater(
      adapter(web: true)
          .reauthenticate(alice, provider: ReauthenticationProvider.google),
      throwsA(changed),
    );
    expect(user.refreshes, 0);
  });
  test('replacement before reauthentication makes no provider call', () async {
    auth.currentUser = TestUser('bob');
    await expectLater(
      adapter().reauthenticate(
        alice,
        password: 'ephemeral',
        provider: ReauthenticationProvider.password,
      ),
      throwsA(changed),
    );
    expect(user.credentials, isEmpty);
    expect(google.initializations, 0);
  });
  test(
    'replacement during credential reauthentication prevents forced refresh',
    () async {
      user.reauthHeld = Completer<UserCredential>();
      final pending = adapter().reauthenticate(
        alice,
        password: 'ephemeral',
        provider: ReauthenticationProvider.password,
      );
      await Future<void>.delayed(Duration.zero);
      auth.currentUser = TestUser('bob');
      user.reauthHeld!.complete(Credential(user));
      await expectLater(pending, throwsA(changed));
      expect(user.refreshes, 0);
    },
  );
  test(
    'replacement during forced refresh invalidates successful verification',
    () async {
      user.refreshHeld = Completer<String?>();
      final pending = adapter().reauthenticate(
        alice,
        password: 'ephemeral',
        provider: ReauthenticationProvider.password,
      );
      await Future<void>.delayed(Duration.zero);
      auth.currentUser = TestUser('bob');
      user.refreshHeld!.complete('synthetic');
      await expectLater(pending, throwsA(changed));
    },
  );
  test('replacement during native initialization never opens Google account selection', () async {
    google.initializationHeld = Completer<void>();
    final pending = adapter().reauthenticate(
      alice,
      provider: ReauthenticationProvider.google,
    );
    await Future<void>.delayed(Duration.zero);
    auth.currentUser = TestUser('bob');
    google.initializationHeld!.complete();
    await expectLater(pending, throwsA(changed));
    expect(google.credentials, 0);
    expect(user.credentials, isEmpty);
  });
  test('replacement during native Google selection never submits the returned credential', () async {
    google.credentialHeld = Completer<AuthCredential>();
    final pending = adapter().reauthenticate(
      alice,
      provider: ReauthenticationProvider.google,
    );
    await Future<void>.delayed(Duration.zero);
    auth.currentUser = TestUser('bob');
    google.credentialHeld!.complete(
      GoogleAuthProvider.credential(idToken: 'synthetic'),
    );
    await expectLater(pending, throwsA(changed));
    expect(user.credentials, isEmpty);
  });
  test('sign-out rechecks owner and leaves Bob untouched', () async {
    auth.currentUser = TestUser('bob');
    await adapter().signOutIfOwner(alice);
    expect(auth.signOuts, 0);
    expect(auth.currentUser!.uid, bob.value);
    auth.currentUser = user;
    await adapter().signOutIfOwner(alice);
    expect(auth.signOuts, 1);
  });
  test(
    'unsupported or missing password provider cannot be reauthenticated',
    () async {
      auth.currentUser = TestUser('alice', ids: ['google.com']);
      await expectLater(
        adapter().reauthenticate(
          alice,
          password: 'ephemeral',
          provider: ReauthenticationProvider.password,
        ),
        throwsA(isA<DeletionFailure>()),
      );
      expect(user.credentials, isEmpty);
    },
  );
}
