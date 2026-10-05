import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/config/environment_providers.dart';
import 'package:tally/core/dates/financial_clock.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/core/theme/tally_theme.dart';
import 'package:tally/features/auth/domain/user_profile.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';
import 'package:tally/shared/presentation/financial_providers.dart';

import 'upcoming_fixtures.dart';

Future<void> searchHost(
  WidgetTester tester,
  OwnerDocumentGateway documents,
  Widget child, {
  double scale = 1,
  bool dark = false,
  String timezone = 'Asia/Manila',
  DateTime? now,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      key: ValueKey(documents.owner),
      overrides: [
        environmentProvider.overrideWithValue(
          const EnvironmentConfig.emulator(projectId: 'demo-tally'),
        ),
        financialClockProvider.overrideWithValue(
          now ?? DateTime.utc(2026, 10, 5, 4),
        ),
        ownerUidProvider.overrideWithValue(documents.owner),
        userProfileProvider.overrideWithValue(
          UserProfile(
            uid: documents.owner,
            displayName: 'Jess',
            photoUrl: null,
            defaultCurrency: CurrencyCode.php,
            timezone: timezone,
            locale: 'en',
            theme: ProfileTheme.system,
            onboardingComplete: true,
            revision: 1,
          ),
        ),
        ownerDocumentsFactoryProvider.overrideWithValue((_) => documents),
        ownerCommandsFactoryProvider.overrideWithValue(
          (_) => UpcomingCommands(documents.owner),
        ),
      ],
      child: MaterialApp(
        theme: dark ? TallyTheme.dark() : TallyTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: Scaffold(body: child),
      ),
    ),
  );
  await tester.pumpAndSettle();
}
