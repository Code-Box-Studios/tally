import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/config/environment_providers.dart';
import 'package:tally/core/dates/financial_clock.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/activity/presentation/activity_screen.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';
import 'package:tally/shared/presentation/financial_providers.dart';

import '../../support/upcoming_fixtures.dart';
import '../auth/session_controller_test.dart' show profile;
import '../financial/financial_dto_test.dart' show audit;

void main() {
  testWidgets(
    'Activity shows owned native payment and correction events with continuation pages',
    (tester) async {
      final owner = OwnerUid('alice');
      final docs = UpcomingDocuments(owner)
        ..pages.addAll([
          RawPage(
            documents: [
              RawDocument('activity-1', {
                ...audit,
                'type': 'paymentMade',
                'title': 'Alice loan',
                'obligationId': 'loan-1',
                'paymentId': 'pay-1',
                'amountMinor': 300000,
                'currency': 'PHP',
                'direction': 'owedByMe',
                'recordedAt': DateTime.utc(2026, 10, 4),
              }),
            ],
            nextCursor: const FixtureCursor(1),
            hasMore: true,
            isFromCache: false,
          ),
          RawPage(
            documents: [
              RawDocument('activity-2', {
                ...audit,
                'type': 'paymentCorrected',
                'title': 'Alice loan',
                'obligationId': 'loan-1',
                'paymentId': 'pay-1',
                'amountMinor': 300000,
                'currency': 'PHP',
                'direction': 'owedByMe',
                'reason': 'Duplicate entry',
                'recordedAt': DateTime.utc(2026, 10, 3),
              }),
            ],
            nextCursor: null,
            hasMore: false,
            isFromCache: false,
          ),
        ]);
      final container = ProviderContainer(
        overrides: [
          environmentProvider.overrideWithValue(
            const EnvironmentConfig.emulator(projectId: 'demo-tally'),
          ),
          ownerUidProvider.overrideWithValue(owner),
          userProfileProvider.overrideWithValue(profile('alice')),
          financialClockProvider.overrideWithValue(
            DateTime.utc(2026, 10, 4, 4),
          ),
          ownerDocumentsFactoryProvider.overrideWithValue((_) => docs),
          ownerCommandsFactoryProvider.overrideWithValue(UpcomingCommands.new),
        ],
      );
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(home: Scaffold(body: ActivityScreen())),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Payment recorded'), findsOneWidget);
      expect(find.text('₱3,000 PHP'), findsOneWidget);
      await tester.ensureVisible(find.text('Load more'));
      await tester.tap(find.text('Load more'));
      await tester.pumpAndSettle();
      expect(find.text('Payment corrected'), findsOneWidget);
      expect(find.text('Duplicate entry'), findsOneWidget);
      expect(find.text('Yesterday'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
