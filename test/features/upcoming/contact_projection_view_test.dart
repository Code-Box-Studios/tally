import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/dates/financial_clock.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/dashboard/data/summary_dto.dart';
import 'package:tally/features/people/presentation/contact_position_panel.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';
import 'package:tally/shared/presentation/financial_providers.dart';

import '../../support/upcoming_fixtures.dart';
import '../auth/session_controller_test.dart' show profile;
import '../financial/financial_dto_test.dart' show audit;

void main() {
  for (final stale in [false, true]) {
    testWidgets(
      'contact position consumes the complete native projection with stale=$stale',
      (tester) async {
        final owner = OwnerUid('alice');
        final contact = ContactId('john');
        final docs = UpcomingDocuments(owner)
          ..records['ledgerState/current'] = RawRecord(
            RawDocument('current', {
              ...audit,
              'revision': stale ? 5 : 4,
              'formulaVersion': 1,
            }),
            isFromCache: false,
          )
          ..records['summaries/${contactSummaryId(contact)}'] = RawRecord(
            RawDocument(contactSummaryId(contact), {
              ...summaryData(),
              'kind': 'contact',
              'contactId': 'john',
              'currencies': {
                for (final currency in CurrencyCode.values)
                  currency.code: {
                    'youOweMinor': currency == CurrencyCode.php ? 200000 : 0,
                    'owedToYouMinor': currency == CurrencyCode.php ? 500000 : 0,
                    'netPositionMinor': currency == CurrencyCode.php
                        ? 300000
                        : 0,
                    'activeCount': currency == CurrencyCode.php ? 2 : 0,
                    'completedCount': 0,
                    'cancelledCount': 0,
                  },
              },
            }),
            isFromCache: false,
          );
        final container = ProviderContainer(
          overrides: [
            ownerUidProvider.overrideWithValue(owner),
            userProfileProvider.overrideWithValue(profile('alice')),
            financialClockProvider.overrideWithValue(
              DateTime.utc(2026, 10, 4, 4),
            ),
            ownerDocumentsFactoryProvider.overrideWithValue((_) => docs),
            ownerCommandsFactoryProvider.overrideWithValue(
              UpcomingCommands.new,
            ),
          ],
        );
        addTearDown(container.dispose);
        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: MaterialApp(
              home: Scaffold(
                body: SingleChildScrollView(
                  child: ContactPositionPanel(contactId: contact),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('₱3,000 PHP'), findsOneWidget);
        expect(find.text('Position for loaded obligations'), findsNothing);
        expect(
          find.textContaining('Updating position'),
          stale ? findsOneWidget : findsNothing,
        );
        expect(
          find.text('2 active · 0 completed · 0 cancelled'),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      },
    );
  }
}
