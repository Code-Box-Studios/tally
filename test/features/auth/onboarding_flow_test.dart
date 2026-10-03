import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/app/tally_app.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/config/environment_providers.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/auth/domain/auth_repository.dart';
import 'package:tally/features/auth/domain/user_profile.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';

import 'session_controller_test.dart' show AuthFixture, ProfileFixture, profile;

class EditableProfileFixture extends ProfileFixture {
  UserProfile? saved;
  @override
  Future<UserProfile> update(
    ProfilePreferences preferences, {
    required OwnerUid owner,
    required int expectedRevision,
    required CommandId commandId,
  }) async {
    final result = UserProfile(
      uid: owner,
      displayName: 'Alice',
      photoUrl: null,
      defaultCurrency: preferences.currency,
      timezone: preferences.timezone,
      locale: 'en',
      theme: preferences.theme,
      onboardingComplete: preferences.onboardingComplete,
      revision: expectedRevision + 1,
    );
    saved = result;
    streams[owner.value]!.add(result);
    return result;
  }
}

void main() {
  testWidgets(
    'onboarding saves actual selections then opens private home and logout removes account',
    (tester) async {
      final auth = AuthFixture();
      final profiles = EditableProfileFixture();
      addTearDown(auth.identities.close);
      addTearDown(() async {
        for (final stream in profiles.streams.values) {
          await stream.close();
        }
      });
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            environmentProvider.overrideWithValue(
              const EnvironmentConfig.emulator(
                projectId: 'demo-tally',
                endpoints: EmulatorEndpoints(host: '127.0.0.1'),
              ),
            ),
            authRepositoryProvider.overrideWithValue(auth),
            profileRepositoryProvider.overrideWithValue(profiles),
          ],
          child: const TallyApp(),
        ),
      );
      await tester.pump();
      auth.identities.add(
        AuthIdentity(OwnerUid('alice'), email: 'alice@example.test'),
      );
      await tester.pump();
      await tester.pump();
      profiles.responses['alice']!.complete(profile('alice', complete: false));
      await tester.pumpAndSettle();
      expect(find.text('Let’s make it yours.'), findsOneWidget);
      await tester.tap(find.byKey(const Key('profile-currency')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('USD').last);
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('profile-timezone')),
        'America/New_York',
      );
      await tester.ensureVisible(find.byKey(const Key('profile-save')));
      await tester.tap(find.byKey(const Key('profile-save')));
      await tester.pumpAndSettle();
      expect(profiles.saved?.defaultCurrency.code, 'USD');
      expect(profiles.saved?.timezone, 'America/New_York');
      expect(profiles.saved?.onboardingComplete, isTrue);
      expect(find.text('Let’s make it yours.'), findsNothing);
      expect(find.text('Home'), findsWidgets);
      await tester.tap(find.text('Settings'));
      await tester.pumpAndSettle();
      expect(find.text('Alice'), findsOneWidget);
      await tester.ensureVisible(find.text('Sign out'));
      await tester.tap(find.text('Sign out'));
      await tester.pumpAndSettle();
      expect(find.text('Welcome back.'), findsOneWidget);
      expect(find.text('Alice'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
