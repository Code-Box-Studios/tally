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
import 'package:tally/shared/presentation/financial_providers.dart';

import '../features/financial/financial_forms_test.dart' show UiDocuments;
import 'recurring_fixtures.dart';
import 'upcoming_fixtures.dart';

UiDocuments recurringUiDocuments({String period = 'scheduled'}) {
  final docs = UiDocuments(uid: recurringOwner.value),
      raw = recurringData(period),
      parent = recurringData('parent');
  parent['obligationId'] = raw['obligationId'];
  if (period.startsWith('variable')) {
    parent['title'] = 'Electricity';
    parent['amountKind'] = 'variable';
    parent['defaultAmountMinor'] = 350000;
  }
  docs.data['obligations']![parent['obligationId'] as String] = parent;
  docs.data['obligationInstances']![raw['instanceId'] as String] = raw;
  return docs;
}

Future<void> recurringHost(
  WidgetTester tester,
  UiDocuments docs,
  UpcomingCommands commands,
  Widget child, {
  double scale = 1,
  String timezone = 'Asia/Manila',
  DateTime? now,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        if (now != null) financialNowProvider.overrideWithValue(() => now),
        environmentProvider.overrideWithValue(
          const EnvironmentConfig.emulator(projectId: 'demo-tally'),
        ),
        ownerUidProvider.overrideWithValue(docs.owner),
        userProfileProvider.overrideWithValue(
          UserProfile(
            uid: docs.owner,
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
        ownerDocumentsFactoryProvider.overrideWithValue((_) => docs),
        ownerCommandsFactoryProvider.overrideWithValue((_) => commands),
      ],
      child: MaterialApp(
        theme: TallyTheme.light(),
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

Map<String, Object?> recurringUiResponse() => {
  'obligationId': 'bill-1',
  'obligationRevision': 2,
  'generationRevision': 2,
  'firstInstanceId': null,
  'instanceId': 'period-1',
  'instanceRevision': 3,
  'paymentId': 'payment-1',
  'evidenceId': null,
  'attemptId': 'attempt-1',
  'reversalId': null,
  'retainedFutureCount': 2,
};
