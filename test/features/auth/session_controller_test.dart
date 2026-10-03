import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/errors/app_failure.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/features/auth/domain/auth_repository.dart';
import 'package:tally/features/auth/domain/user_profile.dart';
import 'package:tally/features/auth/domain/session_state.dart';
import 'package:tally/features/auth/presentation/session_controller.dart';

UserProfile profile(String owner, {bool complete = true}) => UserProfile(
  uid: OwnerUid(owner),
  displayName: owner,
  photoUrl: null,
  defaultCurrency: CurrencyCode.php,
  timezone: 'Asia/Manila',
  locale: 'en',
  theme: ProfileTheme.system,
  onboardingComplete: complete,
  revision: 1,
);

class AuthFixture implements AuthRepository {
  final identities = StreamController<AuthIdentity?>.broadcast(sync: true);
  Object? signOutError;
  @override
  Stream<AuthIdentity?> watchIdentity() => identities.stream;
  @override
  Future<void> signOut() async {
    if (signOutError != null) throw signOutError!;
    identities.add(null);
  }

  @override
  Future<void> signInWithEmail(String email, String password) async {}
  @override
  Future<void> createAccount(String email, String password) async {}
  @override
  Future<void> signInWithGoogle() async {}
  @override
  Future<void> resetPassword(String email) async {}
}

class ProfileFixture implements ProfileRepository {
  final responses = <String, Completer<UserProfile>>{};
  final streams = <String, StreamController<UserProfile>>{};
  int cancelled = 0;
  @override
  Future<UserProfile> bootstrap(OwnerUid owner) =>
      (responses[owner.value] ??= Completer<UserProfile>()).future;
  @override
  Stream<UserProfile> watchProfile(OwnerUid owner) =>
      (streams[owner.value] ??= StreamController<UserProfile>.broadcast(
        onCancel: () {
          cancelled++;
        },
      )).stream;
  @override
  Future<UserProfile> update(
    ProfilePreferences preferences, {
    required OwnerUid owner,
    required int expectedRevision,
    required CommandId commandId,
  }) async => throw UnimplementedError();
}

Future<void> tick() => Future<void>.delayed(Duration.zero);
void main() {
  late AuthFixture auth;
  late ProfileFixture profiles;
  late SessionController controller;
  setUp(() {
    auth = AuthFixture();
    profiles = ProfileFixture();
    controller = SessionController(auth, profiles);
  });
  tearDown(() async {
    await controller.dispose();
    await auth.identities.close();
    for (final stream in profiles.streams.values) {
      await stream.close();
    }
  });
  test('waits for hydrated identity then exposes signed out', () async {
    expect(controller.state.stage, SessionStage.initializing);
    auth.identities.add(null);
    await tick();
    expect(controller.state.stage, SessionStage.signedOut);
  });
  test('bootstrap gates onboarding and watches completed profile', () async {
    auth.identities.add(AuthIdentity(OwnerUid('alice'), displayName: 'Alice'));
    await tick();
    expect(controller.state.stage, SessionStage.bootstrappingProfile);
    profiles.responses['alice']!.complete(profile('alice', complete: false));
    await tick();
    expect(controller.state.stage, SessionStage.needsOnboarding);
    profiles.streams['alice']!.add(profile('alice'));
    await tick();
    expect(controller.state.stage, SessionStage.ready);
  });
  test(
    'a late Alice bootstrap cannot replace Bob after account switch',
    () async {
      auth.identities.add(AuthIdentity(OwnerUid('alice')));
      await tick();
      auth.identities.add(AuthIdentity(OwnerUid('bob')));
      await tick();
      profiles.responses['bob']!.complete(profile('bob'));
      await tick();
      profiles.responses['alice']!.complete(profile('alice'));
      await tick();
      expect(controller.state.profile?.uid, OwnerUid('bob'));
      expect(profiles.streams.containsKey('alice'), isFalse);
    },
  );
  test(
    'logout cancels private profile listeners and hides owner data',
    () async {
      auth.identities.add(AuthIdentity(OwnerUid('alice')));
      await tick();
      profiles.responses['alice']!.complete(profile('alice'));
      await tick();
      await controller.signOut();
      await tick();
      expect(controller.state.stage, SessionStage.signedOut);
      expect(controller.state.profile, isNull);
      expect(profiles.cancelled, 1);
    },
  );
  test('failed signout retains the ready private session', () async {
    auth.identities.add(AuthIdentity(OwnerUid('alice')));
    await tick();
    profiles.responses['alice']!.complete(profile('alice'));
    await tick();
    auth.signOutError = StateError('transport');
    await expectLater(controller.signOut(), throwsStateError);
    expect(controller.state.stage, SessionStage.ready);
    expect(controller.state.profile?.uid, OwnerUid('alice'));
  });
  test('bootstrap failure is redacted and retry can recover', () async {
    auth.identities.add(AuthIdentity(OwnerUid('alice')));
    await tick();
    profiles.responses['alice']!.completeError(StateError('secret-token'));
    await tick();
    expect(controller.state.stage, SessionStage.failure);
    expect(controller.state.failure, isA<AppFailure>());
    expect(
      controller.state.failure.toString(),
      isNot(contains('secret-token')),
    );
    profiles.responses['alice'] = Completer<UserProfile>();
    controller.retry();
    await tick();
    profiles.responses['alice']!.complete(profile('alice'));
    await tick();
    expect(controller.state.stage, SessionStage.ready);
  });
}
