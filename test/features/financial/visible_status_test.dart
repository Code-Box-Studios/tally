import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/dates/financial_clock.dart';
import 'package:tally/features/obligations/domain/visible_financial_status.dart';
import 'package:tally/features/obligations/domain/obligation.dart';
import 'package:tally/features/obligations/data/obligation_dto.dart';
import 'package:tally/features/obligations/presentation/obligation_row.dart';

import 'financial_dto_test.dart' show obligationData;

void main() {
  test(
    'overdue follows the saved schedule zone with paid/cancelled precedence',
    () {
      final data = {
        ...obligationData(),
        'financialStatus': 'pending',
        'totalPaidMinor': 0,
        'remainingMinor': 1000000,
        'dueDate': '2026-10-04',
        'nextDueDate': '2026-10-04',
        'timezone': 'Asia/Manila',
      };
      final parent = ObligationDto.fromMap('loan-1', data, OwnerUid('alice'));
      expect(
        visibleFinancialStatus(parent, DateTime.utc(2026, 10, 4, 15, 59)),
        FinancialStatus.pending,
      );
      expect(
        visibleFinancialStatus(parent, DateTime.utc(2026, 10, 4, 16)),
        FinancialStatus.overdue,
      );
      final newYork = ObligationDto.fromMap('loan-1', {
        ...data,
        'timezone': 'America/New_York',
      }, OwnerUid('alice'));
      expect(
        visibleFinancialStatus(newYork, DateTime.utc(2026, 10, 4, 16)),
        FinancialStatus.pending,
      );
      final paid = ObligationDto.fromMap('loan-1', {
        ...data,
        'financialStatus': 'paid',
        'totalPaidMinor': 1000000,
        'remainingMinor': 0,
      }, OwnerUid('alice'));
      expect(
        visibleFinancialStatus(paid, DateTime.utc(2026, 10, 5)),
        FinancialStatus.paid,
      );
      final cancelled = ObligationDto.fromMap('loan-1', {
        ...data,
        'lifecycle': 'cancelled',
        'financialStatus': 'cancelled',
      }, OwnerUid('alice'));
      expect(
        visibleFinancialStatus(cancelled, DateTime.utc(2026, 10, 5)),
        FinancialStatus.cancelled,
      );
    },
  );
  testWidgets(
    'a due label changes after day rollover without a record mutation',
    (tester) async {
      final parent = ObligationDto.fromMap('loan-1', {
        ...obligationData(),
        'financialStatus': 'pending',
        'totalPaidMinor': 0,
        'remainingMinor': 1000000,
        'dueDate': '2026-10-04',
        'nextDueDate': '2026-10-04',
        'timezone': 'Asia/Manila',
      }, OwnerUid('alice'));
      Widget view(DateTime now) => ProviderScope(
        overrides: [financialClockProvider.overrideWithValue(now)],
        child: MaterialApp(home: Scaffold(body: ObligationRow(parent))),
      );
      await tester.pumpWidget(view(DateTime.utc(2026, 10, 4, 15, 59)));
      await tester.pumpAndSettle();
      expect(find.text('Pending'), findsOneWidget);
      await tester.pumpWidget(view(DateTime.utc(2026, 10, 4, 16)));
      await tester.pumpAndSettle();
      expect(find.text('Overdue'), findsOneWidget);
      expect(parent.status, FinancialStatus.pending);
    },
  );
}
