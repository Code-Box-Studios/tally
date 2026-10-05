import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tally/shared/presentation/financial_actions.dart';
import 'package:tally/shared/domain/financial_failure.dart';
import 'package:tally/features/obligations/data/obligation_dto.dart';
import 'package:tally/features/obligations/data/instance_dto.dart';
import 'package:tally/features/payments/presentation/payment_editor.dart';
import 'package:tally/features/recurring/presentation/deduction_dialogs.dart';
import 'package:tally/features/recurring/data/deduction_dto.dart';
import 'package:tally/features/payments/data/payment_dto.dart';
import 'package:tally/features/payments/presentation/payment_correction_editor.dart';

import '../../support/recurring_fixtures.dart';
import '../../support/recurring_ui.dart';
import '../../support/upcoming_fixtures.dart';

void main() {
  testWidgets(
    'deduction confirmation rejects a date before its billing period',
    (tester) async {
      final docs = recurringUiDocuments(period: 'variableExpected'),
          commands = UpcomingCommands(recurringOwner)
            ..response = recurringUiResponse();
      addTearDown(docs.changes.close);
      final raw = {
        ...recurringData('variableExpected'),
        'amountMinor': 54900,
        'remainingMinor': 54900,
        'amountState': 'known',
      };
      final instance = InstanceDto.fromMap(
        raw['instanceId'] as String,
        raw,
        recurringOwner,
      );
      await recurringHost(
        tester,
        docs,
        commands,
        Dialog(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: DeductionConfirmationDialog(instance: instance),
          ),
        ),
      );
      await tester.enterText(
        find.byKey(const Key('deduction-date')),
        '2026-10-03',
      );
      await tester.ensureVisible(find.byKey(const Key('deduction-save')));
      await tester.tap(find.byKey(const Key('deduction-save')));
      await tester.pumpAndSettle();
      expect(commands.calls, isEmpty);
      expect(
        find.textContaining('on or after the period starts'),
        findsOneWidget,
      );
    },
  );
  testWidgets(
    'deduction confirmation shares the server profile-day limit across timezones',
    (tester) async {
      final docs = recurringUiDocuments(period: 'variableExpected'),
          commands = UpcomingCommands(recurringOwner)
            ..response = recurringUiResponse();
      addTearDown(docs.changes.close);
      final raw = {
            ...recurringData('variableExpected'),
            'amountMinor': 54900,
            'remainingMinor': 54900,
            'amountState': 'known',
          },
          instance = InstanceDto.fromMap(
            raw['instanceId'] as String,
            raw,
            recurringOwner,
          );
      await recurringHost(
        tester,
        docs,
        commands,
        Dialog(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: DeductionConfirmationDialog(instance: instance),
          ),
        ),
        timezone: 'America/Los_Angeles',
        now: DateTime.utc(2026, 10, 5),
      );
      await tester.enterText(
        find.byKey(const Key('deduction-date')),
        '2026-10-05',
      );
      await tester.ensureVisible(find.byKey(const Key('deduction-save')));
      await tester.tap(find.byKey(const Key('deduction-save')));
      await tester.pumpAndSettle();
      expect(commands.calls, isEmpty);
      expect(find.textContaining('on or before today'), findsOneWidget);
    },
  );
  testWidgets(
    'stale deduction revision requires reopening before another command',
    (tester) async {
      final docs = recurringUiDocuments(period: 'deducted'),
          pending = Completer<Map<String, Object?>>(),
          commands = UpcomingCommands(recurringOwner)..pending = pending;
      addTearDown(docs.changes.close);
      final raw = recurringData('deducted'),
          instance = InstanceDto.fromMap(
            raw['instanceId'] as String,
            raw,
            recurringOwner,
          );
      await recurringHost(
        tester,
        docs,
        commands,
        Dialog(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: DeductionFailureDialog(instance: instance),
          ),
        ),
      );
      await tester.enterText(
        find.byKey(const Key('deduction-reason')),
        'Declined',
      );
      await tester.ensureVisible(find.byKey(const Key('deduction-save')));
      await tester.tap(find.byKey(const Key('deduction-save')));
      await tester.pump();
      pending.completeError(
        const FinancialFailure(
          FinancialFailureCode.conflict,
          'This record changed. Refresh before saving again.',
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Close this form'), findsOneWidget);
      expect(
        tester
            .widget<FilledButton>(find.byKey(const Key('deduction-save')))
            .onPressed,
        isNull,
      );
      expect(commands.calls.length, 1);
    },
  );
  testWidgets(
    'confirming an assumption confirms only its unpaid-at-deduction remainder',
    (tester) async {
      final docs = recurringUiDocuments(period: 'deducted'),
          commands = UpcomingCommands(recurringOwner)
            ..response = recurringUiResponse();
      addTearDown(docs.changes.close);
      final raw = recurringData('deducted'),
          instance = InstanceDto.fromMap(
            raw['instanceId'] as String,
            raw,
            recurringOwner,
          );
      final event = {
        ...recurringData('failureAttempt'),
        'eventType': 'assumed',
        'actor': 'system',
        'expectedAmountMinor': 34900,
        'instanceId': instance.id.value,
        'obligationId': instance.obligationId.value,
      };
      final attempt = DeductionDto.attempt(
        event['attemptId'] as String,
        event,
        recurringOwner,
      );
      await recurringHost(
        tester,
        docs,
        commands,
        Dialog(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: DeductionConfirmationDialog(
              instance: instance,
              assumedAttempt: attempt,
            ),
          ),
        ),
      );
      await tester.ensureVisible(find.byKey(const Key('deduction-save')));
      await tester.tap(find.byKey(const Key('deduction-save')));
      await tester.pumpAndSettle();
      expect(commands.calls.single.payload['amountMinor'], 34900);
    },
  );
  testWidgets(
    'correcting a recurring payment retains the chosen period and restores its balance',
    (tester) async {
      final docs = recurringUiDocuments(period: 'deducted'),
          commands = UpcomingCommands(recurringOwner)
            ..response = {
              ...recurringUiResponse(),
              'originalPaymentId': recurringData('payment')['paymentId'],
              'obligationInstanceId': recurringData('deducted')['instanceId'],
              'reversalId': 'reversal-1',
              'replacementId': 'replacement-1',
            };
      addTearDown(docs.changes.close);
      final raw = recurringData('parent'),
          period = recurringData('deducted'),
          payment = recurringData('payment');
      final parent = ObligationDto.fromMap(
            raw['obligationId'] as String,
            raw,
            recurringOwner,
          ),
          instance = InstanceDto.fromMap(
            period['instanceId'] as String,
            period,
            recurringOwner,
          ),
          original = PaymentDto.fromMap(
            payment['paymentId'] as String,
            payment,
            recurringOwner,
          );
      await recurringHost(
        tester,
        docs,
        commands,
        Dialog(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: PaymentCorrectionEditor(
              obligation: parent,
              original: original,
              selectedInstance: instance,
            ),
          ),
        ),
      );
      await tester.enterText(
        find.byKey(const Key('correction-reason')),
        'Actual payment was smaller',
      );
      final container = ProviderScope.containerOf(
        tester.element(find.byType(PaymentCorrectionEditor)),
      );
      await tester.tap(find.text('Add a corrected replacement payment'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('correction-amount')), '349');
      await tester.ensureVisible(find.byKey(const Key('correction-save')));
      await tester.tap(find.byKey(const Key('correction-save')));
      await tester.pumpAndSettle();
      expect(commands.calls.single.name, 'correctPayment');
      expect(
        (commands.calls.single.payload['replacement'] as Map)['amountMinor'],
        34900,
      );
      expect(tester.takeException(), isNull);
      expect(container.read(financialActionsProvider).error, isNull);
    },
  );
  testWidgets(
    'chosen recurring period records a partial payment with native period balance',
    (tester) async {
      final docs = recurringUiDocuments(),
          commands = UpcomingCommands(recurringOwner)
            ..response = {
              ...recurringUiResponse(),
              'obligationInstanceId': recurringData('scheduled')['instanceId'],
            };
      addTearDown(docs.changes.close);
      final raw = recurringData('parent'), period = recurringData('scheduled');
      final parent = ObligationDto.fromMap(
            raw['obligationId'] as String,
            raw,
            recurringOwner,
          ),
          instance = InstanceDto.fromMap(
            period['instanceId'] as String,
            period,
            recurringOwner,
          );
      await recurringHost(
        tester,
        docs,
        commands,
        Dialog(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: PaymentEditor(
              obligation: parent,
              selectedInstance: instance,
            ),
          ),
        ),
      );
      await tester.enterText(find.byKey(const Key('payment-amount')), '200');
      await tester.ensureVisible(find.byKey(const Key('payment-save')));
      await tester.tap(find.byKey(const Key('payment-save')));
      await tester.pumpAndSettle();
      expect(
        commands.calls.single.payload['obligationInstanceId'],
        instance.id.value,
      );
      expect(commands.calls.single.payload['amountMinor'], 20000);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'failed assumed deduction explains reversal and freezes an uncertain original command',
    (tester) async {
      final docs = recurringUiDocuments(period: 'deducted'),
          commands = UpcomingCommands(recurringOwner)
            ..response = recurringUiResponse()
            ..failNext = true;
      addTearDown(docs.changes.close);
      final raw = recurringData('deducted'),
          instance = InstanceDto.fromMap(
            raw['instanceId'] as String,
            raw,
            recurringOwner,
          );
      final live = ValueNotifier(instance);
      addTearDown(live.dispose);
      await recurringHost(
        tester,
        docs,
        commands,
        Dialog(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: ValueListenableBuilder(
              valueListenable: live,
              builder: (_, value, _) => DeductionFailureDialog(instance: value),
            ),
          ),
        ),
      );
      expect(find.textContaining('reversal'), findsWidgets);
      await tester.enterText(
        find.byKey(const Key('deduction-reason')),
        'Card declined',
      );
      await tester.ensureVisible(find.byKey(const Key('deduction-save')));
      await tester.tap(find.byKey(const Key('deduction-save')));
      await tester.pumpAndSettle();
      expect(find.text('Retry original action'), findsOneWidget);
      final changed = recurringData('failed');
      live.value = InstanceDto.fromMap(
        changed['instanceId'] as String,
        changed,
        recurringOwner,
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('deduction-save')));
      await tester.tap(find.byKey(const Key('deduction-save')));
      await tester.pumpAndSettle();
      expect(commands.calls[0].id, commands.calls[1].id);
      expect(commands.calls[0].payload, commands.calls[1].payload);
      expect(commands.calls[0].payload['expectedRevision'], 2);
    },
  );
  testWidgets(
    'expected confirmation uses known bill amount without claiming a bank connection',
    (tester) async {
      final docs = recurringUiDocuments(period: 'variableExpected'),
          commands = UpcomingCommands(recurringOwner)
            ..response = recurringUiResponse();
      addTearDown(docs.changes.close);
      final raw = {
            ...recurringData('variableExpected'),
            'amountMinor': 54900,
            'remainingMinor': 54900,
            'amountState': 'known',
          },
          instance = InstanceDto.fromMap(
            raw['instanceId'] as String,
            raw,
            recurringOwner,
          );
      await recurringHost(
        tester,
        docs,
        commands,
        Dialog(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: DeductionConfirmationDialog(instance: instance),
          ),
        ),
      );
      await tester.ensureVisible(find.byKey(const Key('deduction-save')));
      await tester.tap(find.byKey(const Key('deduction-save')));
      await tester.pumpAndSettle();
      expect(commands.calls.single.name, 'confirmDeduction');
      expect(commands.calls.single.payload['amountMinor'], 54900);
    },
  );
}
