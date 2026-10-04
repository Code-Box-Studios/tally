import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/features/auth/domain/user_profile.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/auth/presentation/onboarding_screen.dart';

import 'session_controller_test.dart' show ProfileFixture, profile;

class RevisionCapture extends ProfileFixture {
  int? submittedRevision;
  @override
  Future<UserProfile> update(
    ProfilePreferences preferences, {
    required OwnerUid owner,
    required int expectedRevision,
    required CommandId commandId,
  }) async {
    submittedRevision = expectedRevision;
    throw StateError('revision conflict');
  }
}

UserProfile newer() => UserProfile(
  uid: OwnerUid('alice'),
  displayName: 'alice',
  photoUrl: null,
  defaultCurrency: CurrencyCode.usd,
  timezone: 'America/New_York',
  locale: 'en',
  theme: ProfileTheme.dark,
  onboardingComplete: true,
  revision: 2,
);
void main() {
  testWidgets(
    'dirty draft keeps original revision when newer remote preferences arrive',
    (tester) async {
      final profiles = RevisionCapture();
      final current = ValueNotifier(profile('alice'));
      addTearDown(current.dispose);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [profileRepositoryProvider.overrideWithValue(profiles)],
          child: MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: ValueListenableBuilder(
                  valueListenable: current,
                  builder: (context, value, child) => ProfilePreferencesForm(
                    key: ValueKey(value.uid),
                    profile: value,
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.enterText(
        find.byKey(const Key('profile-timezone')),
        'Asia/Tokyo',
      );
      current.value = newer();
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('profile-save')));
      await tester.tap(find.byKey(const Key('profile-save')));
      await tester.pumpAndSettle();
      expect(profiles.submittedRevision, 1);
      expect(
        find.text(
          'Preferences changed on another device. Reload to use the latest values.',
        ),
        findsOneWidget,
      );
      await tester.tap(find.text('Reload preferences'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<TextFormField>(find.byKey(const Key('profile-timezone')))
            .controller!
            .text,
        'America/New_York',
      );
      expect(find.text('USD'), findsOneWidget);
    },
  );
  testWidgets(
    'untouched preference draft follows remote changes without overwriting them',
    (tester) async {
      final current = ValueNotifier(profile('alice'));
      addTearDown(current.dispose);
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: ValueListenableBuilder(
                  valueListenable: current,
                  builder: (context, value, child) => ProfilePreferencesForm(
                    key: ValueKey(value.uid),
                    profile: value,
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      current.value = newer();
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<TextFormField>(find.byKey(const Key('profile-timezone')))
            .controller!
            .text,
        'America/New_York',
      );
      expect(find.text('USD'), findsOneWidget);
    },
  );
}
