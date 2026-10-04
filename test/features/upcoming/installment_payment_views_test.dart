import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/shared/domain/financial_failure.dart';
import 'package:tally/features/obligations/presentation/obligation_detail_screen.dart';

import '../financial/financial_forms_test.dart'
    show UiDocuments, UiCommands, host, enter, tap;
import '../financial/financial_dto_test.dart' show obligationData, paymentData;
import '../../support/upcoming_fixtures.dart';

class PeriodCommands extends UiCommands {
  PeriodCommands(super.documents);
  final payloads = <({String name, Map<String, Object?> payload})>[];
  final ids = <CommandId>[];
  bool loseFirstResponse = false;
  bool loseCorrectionResponse = false;
  @override
  Future<Map<String, Object?>> call(
    String name,
    CommandId id,
    Map<String, Object?> payload,
  ) async {
    payloads.add((name: name, payload: payload));
    ids.add(id);
    if (loseFirstResponse && payloads.length == 1) {
      documents.data['obligations']!['loan-1']!['totalPaidMinor'] = 15000;
      documents.data['obligations']!['loan-1']!['remainingMinor'] = 5000;
      documents.data['obligationInstances']!['first']!.addAll({
        'totalPaidMinor': 10000,
        'remainingMinor': 0,
        'financialStatus': 'paid',
        'closed': true,
      });
      documents.data['obligationInstances']!['second']!.addAll({
        'totalPaidMinor': 5000,
        'remainingMinor': 5000,
        'financialStatus': 'partiallyPaid',
      });
      documents.changes.add(null);
      throw const FinancialFailure(
        FinancialFailureCode.offline,
        'Could not confirm this save.',
      );
    }
    if (name == 'correctPayment' &&
        loseCorrectionResponse &&
        payloads.length == 1) {
      documents.data['obligations']!['loan-1']!.addAll({
        'totalPaidMinor': 12000,
        'remainingMinor': 8000,
        'revision': 3,
      });
      documents.data['obligationInstances']!['second']!.addAll({
        'totalPaidMinor': 2000,
        'remainingMinor': 8000,
      });
      documents.changes.add(null);
      throw const FinancialFailure(
        FinancialFailureCode.offline,
        'Could not confirm this correction.',
      );
    }
    if (name == 'correctPayment') {
      return {
        'originalPaymentId': 'pay-1',
        'reversalId': 'reverse-1',
        'replacementId': 'replacement-1',
        'obligationId': 'loan-1',
        'obligationInstanceId': null,
        'obligationRevision': 3,
        'instanceRevision': null,
        'allocationRevisions': [
          {'instanceId': 'first', 'instanceRevision': 3},
          {'instanceId': 'second', 'instanceRevision': 3},
        ],
      };
    }
    final chosen = payload['obligationInstanceId'] as String?;
    return {
      'paymentId': 'pay-1',
      'obligationId': 'loan-1',
      'obligationInstanceId': chosen,
      'obligationRevision': 2,
      'instanceRevision': chosen == null ? null : 2,
      'allocationRevisions': [
        for (final instance in chosen == null ? ['first', 'second'] : [chosen])
          {'instanceId': instance, 'instanceRevision': 2},
      ],
    };
  }
}

UiDocuments periodsFixture({bool paid = false}) {
  final docs = UiDocuments();
  docs.data['obligations']!['loan-1'] = {
    ...obligationData(),
    'type': 'installment',
    'singleInstanceId': null,
    'installmentInstanceIds': ['first', 'second'],
    'originalAmountMinor': 20000,
    'totalPaidMinor': paid ? 15000 : 0,
    'remainingMinor': paid ? 5000 : 20000,
    'financialStatus': paid ? 'partiallyPaid' : 'pending',
    'revision': paid ? 2 : 1,
  };
  docs.data['obligationInstances']!.addAll({
    'first': {
      ...instanceData('first', due: '2026-10-15'),
      'hasPaymentHistory': paid,
      'totalPaidMinor': paid ? 10000 : 0,
      'remainingMinor': paid ? 0 : 10000,
      'financialStatus': paid ? 'paid' : 'pending',
      'closed': paid,
    },
    'second': {
      ...instanceData('second', due: '2026-11-15'),
      'hasPaymentHistory': paid,
      'totalPaidMinor': paid ? 5000 : 0,
      'remainingMinor': paid ? 5000 : 10000,
      'financialStatus': paid ? 'partiallyPaid' : 'pending',
    },
  });
  if (paid) {
    docs.data['payments']!['pay-1'] = {
      ...paymentData(),
      'amountMinor': 15000,
      'obligationInstanceId': null,
      'allocations': [
        {'instanceId': 'first', 'amountMinor': 10000},
        {'instanceId': 'second', 'amountMinor': 5000},
      ],
    };
  }
  return docs;
}

void main() {
  testWidgets(
    'uncertain correction retries the captured original revision and replacement after committed balances update',
    (tester) async {
      final docs = periodsFixture(paid: true);
      addTearDown(docs.changes.close);
      final commands = PeriodCommands(docs)..loseCorrectionResponse = true;
      await host(
        tester,
        docs,
        commands,
        ObligationDetailScreen(id: ObligationId('loan-1')),
      );
      await tap(tester, 'correct-pay-1');
      await enter(tester, 'correction-reason', 'Wrong amount');
      await tester.ensureVisible(
        find.text('Add a corrected replacement payment'),
      );
      await tester.tap(find.text('Add a corrected replacement payment'));
      await tester.pumpAndSettle();
      await enter(tester, 'correction-amount', '120');
      await tap(tester, 'correction-save');
      expect(find.text('Retry original correction'), findsOneWidget);
      await tap(tester, 'correction-save');
      expect(commands.payloads, hasLength(2));
      expect(commands.payloads[1].payload, commands.payloads[0].payload);
      expect(commands.ids[1], commands.ids[0]);
      expect(commands.payloads[1].payload['expectedObligationRevision'], 2);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'payment across periods shows the exact allocations and submits them explicitly',
    (tester) async {
      final docs = periodsFixture();
      addTearDown(docs.changes.close);
      final commands = PeriodCommands(docs);
      await host(
        tester,
        docs,
        commands,
        ObligationDetailScreen(id: ObligationId('loan-1')),
      );
      await tap(tester, 'record-payment');
      await enter(tester, 'payment-amount', '150');
      expect(find.text('This payment covers'), findsOneWidget);
      expect(find.text('After this payment'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byKey(const Key('payment-remaining-preview')),
          matching: find.text('₱50 PHP'),
        ),
        findsOneWidget,
      );
      await tap(tester, 'payment-save');
      expect(commands.payloads.single.name, 'recordInstallmentPayment');
      expect(commands.payloads.single.payload['explicitAllocations'], [
        {'instanceId': 'first', 'amountMinor': 10000},
        {'instanceId': 'second', 'amountMinor': 5000},
      ]);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'uncertain multi-period payment retries its original immutable payload and identity after live balances change',
    (tester) async {
      final docs = periodsFixture();
      addTearDown(docs.changes.close);
      final commands = PeriodCommands(docs)..loseFirstResponse = true;
      await host(
        tester,
        docs,
        commands,
        ObligationDetailScreen(id: ObligationId('loan-1')),
      );
      await tap(tester, 'record-payment');
      await enter(tester, 'payment-amount', '150');
      await tap(tester, 'payment-save');
      expect(find.text('Retry original payment'), findsOneWidget);
      await tap(tester, 'payment-save');
      expect(commands.payloads, hasLength(2));
      expect(commands.payloads[1].payload, commands.payloads[0].payload);
      expect(commands.ids[1], commands.ids[0]);
      expect(commands.payloads[1].payload['amountMinor'], 15000);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'an explicit period payment never moves the amount into another period',
    (tester) async {
      final docs = periodsFixture();
      addTearDown(docs.changes.close);
      final commands = PeriodCommands(docs);
      await host(
        tester,
        docs,
        commands,
        ObligationDetailScreen(id: ObligationId('loan-1')),
      );
      await tap(tester, 'pay-period-second');
      await enter(tester, 'payment-amount', '50');
      await tap(tester, 'payment-save');
      expect(commands.payloads.single.name, 'recordPayment');
      expect(
        commands.payloads.single.payload['obligationInstanceId'],
        'second',
      );
      expect(commands.payloads.single.payload['amountMinor'], 5000);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'correction shows exact reversal and replacement allocations and captures the preview revision',
    (tester) async {
      final docs = periodsFixture(paid: true);
      addTearDown(docs.changes.close);
      final commands = PeriodCommands(docs);
      await host(
        tester,
        docs,
        commands,
        ObligationDetailScreen(id: ObligationId('loan-1')),
      );
      expect(find.text('Applied to'), findsOneWidget);
      await tap(tester, 'correct-pay-1');
      expect(find.text('The reversal restores these periods'), findsOneWidget);
      await enter(tester, 'correction-reason', 'Wrong amount');
      await tester.ensureVisible(
        find.text('Add a corrected replacement payment'),
      );
      await tester.tap(find.text('Add a corrected replacement payment'));
      await tester.pumpAndSettle();
      await enter(tester, 'correction-amount', '120');
      expect(find.text('Replacement payment covers'), findsOneWidget);
      expect(
        find.textContaining('It can cover different periods.'),
        findsOneWidget,
      );
      await tap(tester, 'correction-save');
      expect(commands.payloads.single.name, 'correctPayment');
      expect(commands.payloads.single.payload['expectedObligationRevision'], 2);
      expect(tester.takeException(), isNull);
    },
  );
}
