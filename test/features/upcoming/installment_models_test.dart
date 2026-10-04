import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/dates/local_date.dart';
import 'package:tally/core/errors/app_failure.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/core/money/money.dart';
import 'package:tally/features/obligations/domain/installment_schedule.dart';
import 'package:tally/features/obligations/domain/installment_commands.dart';
import 'package:tally/features/obligations/domain/obligation_commands.dart';
import 'package:tally/features/obligations/domain/obligation.dart';
import 'package:tally/features/obligations/data/obligation_dto.dart';
import 'package:tally/features/obligations/data/firestore_obligations_repository.dart';
import 'package:tally/features/payments/data/firestore_payments_repository.dart';
import 'package:tally/features/payments/data/payment_dto.dart';
import 'package:tally/features/payments/domain/payment_commands.dart';
import 'package:tally/features/payments/domain/payment_entry.dart';

import '../financial/financial_dto_test.dart' show obligationData, paymentData;
import '../../support/upcoming_fixtures.dart';

ObligationDraft loanDraft() => ObligationDraft(
  title: 'Loan',
  description: '',
  notes: '',
  direction: ObligationDirection.owedByMe,
  amount: Money.fromMinorUnits(10000, CurrencyCode.php),
  originationDate: LocalDate.parse('2026-01-01'),
  dueDate: LocalDate.parse('2026-12-15'),
  contactId: null,
  categoryId: CategoryId('default-personal-loan'),
  paymentSourceId: null,
  interestInfo: null,
);
InstallmentDraft installmentDraft() => InstallmentDraft(
  loanDraft(),
  InstallmentSchedule.equal(
    principal: loanDraft().amount,
    originationDate: loanDraft().originationDate,
    dueDates: [
      for (final month in [10, 11, 12]) LocalDate.fromParts(2026, month, 15),
    ],
  ),
);
void main() {
  final owner = OwnerUid('alice');
  test('equal installment schedule keeps final minor remainder and validates sum dates currency bounds', () {
    final schedule = installmentDraft().schedule;
    expect(schedule.terms.map((term) => term.amount.minorUnits), [
      3333,
      3333,
      3334,
    ]);
    expect(installmentDraft().toPayload()['installments'], [
      for (final term in schedule.terms)
        {
          'amountMinor': term.amount.minorUnits,
          'dueDate': term.dueDate.toString(),
        },
    ]);
    expect(
      () => InstallmentSchedule(
        principal: loanDraft().amount,
        originationDate: loanDraft().originationDate,
        terms: [
          InstallmentTerm(
            Money.fromMinorUnits(4000, CurrencyCode.php),
            LocalDate.parse('2026-10-15'),
          ),
          InstallmentTerm(
            Money.fromMinorUnits(5000, CurrencyCode.php),
            LocalDate.parse('2026-11-15'),
          ),
        ],
      ),
      throwsA(isA<AppFailure>()),
    );
    expect(
      () => InstallmentSchedule.equal(
        principal: loanDraft().amount,
        originationDate: loanDraft().originationDate,
        dueDates: [LocalDate.parse('2026-10-15')],
      ),
      throwsA(isA<AppFailure>()),
    );
  });
  test('installment DTO retains bounded unique period identity and rejects malformed schedules', () {
    final raw = {
      ...obligationData(),
      'type': 'installment',
      'singleInstanceId': null,
      'installmentInstanceIds': ['first', 'second'],
    };
    expect(
      ObligationDto.fromMap(
        'loan-1',
        raw,
        owner,
      ).installmentInstanceIds.map((id) => id.value),
      ['first', 'second'],
    );
    for (final ids in [
      <String>[],
      ['first'],
      ['first', 'first'],
      List.generate(121, (i) => 'period-$i'),
    ]) {
      expect(
        () => ObligationDto.fromMap('loan-1', {
          ...raw,
          'installmentInstanceIds': ids,
        }, owner),
        throwsA(isA<AppFailure>()),
      );
    }
  });
  test('installment repository sends exact terms and parses every returned period revision', () async {
    final docs = UpcomingDocuments(owner);
    final commands = UpcomingCommands(owner)
      ..response = {
        'obligationId': 'loan-1',
        'obligationInstanceIds': ['first', 'second', 'third'],
        'obligationRevision': 1,
        'instanceRevisions': [
          for (final id in ['first', 'second', 'third'])
            {'instanceId': id, 'instanceRevision': 1},
        ],
      };
    final created = await FirestoreObligationsRepository(
      docs,
      commands,
    ).createInstallment(installmentDraft(), CommandId('create-1'));
    expect(created.instanceIds.length, 3);
    expect(commands.calls.single.name, 'createInstallment');
    expect(commands.calls.single.payload, installmentDraft().toPayload());
  });
  test('multi-period payment and correction results preserve null single-period IDs', () async {
    final docs = UpcomingDocuments(owner);
    final commands = UpcomingCommands(owner)
      ..response = {
        'paymentId': 'pay-1',
        'obligationId': 'loan-1',
        'obligationInstanceId': null,
        'obligationRevision': 2,
        'instanceRevision': null,
        'allocationRevisions': [
          {'instanceId': 'first', 'instanceRevision': 2},
          {'instanceId': 'second', 'instanceRevision': 2},
        ],
      };
    final repository = FirestorePaymentsRepository(docs, commands);
    final result = await repository.recordInstallment(
      InstallmentPaymentDraft(
        obligationId: ObligationId('loan-1'),
        terms: PaymentTerms(
          amount: Money.fromMinorUnits(5000, CurrencyCode.php),
          date: LocalDate.parse('2026-01-02'),
          sourceId: null,
          method: PaymentMethod.cash,
        ),
      ),
      CommandId('pay-1'),
    );
    expect(result.instanceId, isNull);
    expect(result.instanceRevision, isNull);
    expect(result.allocationRevisions.length, 2);
    commands.response = {
      ...commands.response,
      'originalPaymentId': 'pay-1',
      'reversalId': 'reverse-1',
      'replacementId': null,
    };
    final corrected = await repository.correct(
      PaymentCorrection(
        paymentId: PaymentId('pay-1'),
        reason: 'Duplicate entry',
      ),
      CommandId('correct-1'),
    );
    expect(corrected.instanceId, isNull);
    expect(corrected.allocationRevisions.length, 2);
  });
  test('payment DTO accepts exact multi-period history and rejects a false single-period link', () {
    final raw = {
      ...paymentData(),
      'obligationInstanceId': null,
      'allocations': [
        {'instanceId': 'first', 'amountMinor': 100000},
        {'instanceId': 'second', 'amountMinor': 200000},
      ],
    };
    expect(PaymentDto.fromMap('pay-1', raw, owner).allocations.length, 2);
    expect(
      () => PaymentDto.fromMap('pay-1', {
        ...raw,
        'obligationInstanceId': 'first',
      }, owner),
      throwsA(isA<AppFailure>()),
    );
  });
}
