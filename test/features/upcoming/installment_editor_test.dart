import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/features/obligations/data/instance_dto.dart';
import 'package:tally/features/obligations/presentation/installment_schedule_editor.dart';

import '../../support/upcoming_fixtures.dart';

import 'package:tally/features/obligations/presentation/obligation_editor.dart';
import 'package:tally/core/identifiers/entity_ids.dart';

import '../financial/financial_forms_test.dart'
    show UiDocuments, UiCommands, host, enter, tap;

class ScheduleCommands extends UiCommands {
  ScheduleCommands(super.documents);
  final payloads = <Map<String, Object?>>[];
  @override
  Future<Map<String, Object?>> call(
    String name,
    CommandId id,
    Map<String, Object?> payload,
  ) async {
    if (name != 'createInstallment') {
      throw StateError('Expected installment creation');
    }
    payloads.add(payload);
    return {
      'obligationId': 'loan-1',
      'obligationInstanceIds': ['first', 'second'],
      'obligationRevision': 1,
      'instanceRevisions': [
        {'instanceId': 'first', 'instanceRevision': 1},
        {'instanceId': 'second', 'instanceRevision': 1},
      ],
    };
  }
}

void main() {
  for (final size in [const Size(320, 640), const Size(640, 320)]) {
    testWidgets(
      'all 120 periods remain reachable at $size with enlarged text and keyboard',
      (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final owner = OwnerUid('alice');
        final initial = [
          for (var i = 0; i < 120; i++)
            InstanceDto.fromMap('term-$i', {
              ...instanceData('term-$i', due: '2026-10-15'),
              'amountMinor': 100,
              'remainingMinor': 100,
              if (i > 0) 'hasPaymentHistory': false,
            }, owner),
        ];
        final key = GlobalKey<InstallmentScheduleEditorState>();
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: MediaQuery(
                data: MediaQueryData(
                  size: size,
                  textScaler: const TextScaler.linear(2),
                  viewInsets: const EdgeInsets.only(bottom: 140),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: SingleChildScrollView(
                    child: InstallmentScheduleEditor(
                      key: key,
                      principalText: '120',
                      currency: CurrencyCode.php,
                      originationText: '2026-01-01',
                      initial: initial,
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('120. Due 2026-10-15'), findsOneWidget);
        expect(
          tester
              .widget<TextField>(find.byKey(const Key('installment-amount-0')))
              .enabled,
          isFalse,
        );
        expect(key.currentState!.validate()!.terms, hasLength(120));
        await tester.ensureVisible(
          find.byKey(const Key('installment-date-119')),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets(
    'borrowed-money editor offers a finite schedule with full preview and exact total validation',
    (tester) async {
      final docs = UiDocuments();
      addTearDown(docs.changes.close);
      final commands = ScheduleCommands(docs);
      var saved = false;
      await host(
        tester,
        docs,
        commands,
        ObligationEditor(
          onInstallmentSaved: (_) {
            saved = true;
          },
        ),
      );
      await enter(tester, 'obligation-title', 'Installment loan');
      await enter(tester, 'obligation-amount', '100.01');
      await enter(tester, 'obligation-date', '2026-01-01');
      await tap(tester, 'installment-toggle');
      expect(find.text('Installment schedule'), findsOneWidget);
      await enter(tester, 'installment-date-0', '2026-10-15');
      await enter(tester, 'installment-date-1', '2026-11-15');
      await tap(tester, 'installment-equal');
      expect(find.text('50.00'), findsOneWidget);
      expect(find.text('50.01'), findsOneWidget);
      await enter(tester, 'installment-amount-1', '49.00');
      await tap(tester, 'obligation-save');
      expect(find.textContaining('equal the original amount'), findsOneWidget);
      expect(commands.payloads, isEmpty);
      await enter(tester, 'installment-amount-1', '50.01');
      await tap(tester, 'obligation-save');
      expect(saved, isTrue);
      expect(commands.payloads.single['installments'], [
        {'amountMinor': 5000, 'dueDate': '2026-10-15'},
        {'amountMinor': 5001, 'dueDate': '2026-11-15'},
      ]);
      expect(tester.takeException(), isNull);
    },
  );
}
