import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/errors/app_failure.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/obligations/data/obligation_dto.dart';
import 'package:tally/features/obligations/data/instance_dto.dart';
import 'package:tally/features/obligations/domain/obligation.dart';
import 'package:tally/features/payments/data/payment_dto.dart';
import 'package:tally/features/payments/domain/payment_entry.dart';
import 'package:tally/features/recurring/data/recurrence_dto.dart';
import 'package:tally/features/recurring/data/deduction_dto.dart';
import 'package:tally/features/recurring/domain/deduction_attempt.dart';
import 'package:tally/features/recurring/domain/recurring_commands.dart';

import '../../support/recurring_fixtures.dart';

void main() {
  test('reminder values are immutable and reject duplicate offsets and invalid times', () {
    final days = [1, 3],
        policy = ReminderPolicy(
          enabled: true,
          offsetDays: days,
          localTime: '09:00',
        );
    days.add(7);
    expect(policy.offsetDays, [1, 3]);
    expect(() => policy.offsetDays.add(9), throwsUnsupportedError);
    expect(
      () =>
          ReminderPolicy(enabled: true, offsetDays: [1, 1], localTime: '09:00'),
      throwsArgumentError,
    );
    expect(
      () =>
          ReminderPolicy(enabled: true, offsetDays: [366], localTime: '09:00'),
      throwsArgumentError,
    );
    expect(
      () => ReminderPolicy(enabled: true, offsetDays: [], localTime: '24:00'),
      throwsArgumentError,
    );
  });
  test('actual recurring template preserves null lifetime totals and anchored state', () {
    final raw = recurringData('parent'),
        parent = ObligationDto.fromMap(
          raw['obligationId'] as String,
          raw,
          recurringOwner,
        );
    expect(parent.originalAmount, isNull);
    expect(parent.paidAmount, isNull);
    expect(parent.remainingAmount, isNull);
    expect(parent.recurrence!.rule.timezone, 'Asia/Manila');
    expect(parent.recurrence!.generationCursor, 0);
    expect(parent.reminderPolicy!.enabled, false);
    expect(parent.nextDueDate, isNull);
    for (final patch in [
      {'generationCursor': -2},
      {
        'pauseRanges': [
          {'startDate': '2026-11-02', 'endDate': '2026-11-01'},
        ],
      },
      {'extra': true},
    ]) {
      expect(
        () => RecurrenceDto.fromMap({
          ...Map<String, Object?>.from(raw['recurrence'] as Map),
          ...patch,
        }),
        throwsA(isA<AppFailure>()),
      );
    }
  });
  test('unknown variable bill exposes estimate independently and skipped unknown history remains readable', () {
    final raw = recurringData('variable'),
        period = InstanceDto.fromMap(
          raw['instanceId'] as String,
          raw,
          recurringOwner,
        );
    expect(period.amount, isNull);
    expect(period.remainingAmount, isNull);
    expect(period.estimatedAmount!.minorUnits, 350000);
    expect(period.deductionStatus, DeductionStatus.scheduled);
    expect(period.requiresDeductionConfirmation, false);
    final skipped = InstanceDto.fromMap(raw['instanceId'] as String, {
      ...raw,
      'closed': true,
      'financialStatus': 'skipped',
    }, recurringOwner);
    expect(skipped.status, FinancialStatus.skipped);
    expect(
      () => InstanceDto.fromMap(raw['instanceId'] as String, {
        ...raw,
        'totalPaidMinor': 1,
      }, recurringOwner),
      throwsA(isA<AppFailure>()),
    );
  });
  test('actual assumed confirmed failed periods retain saved timing and immutable provenance', () {
    for (final (name, status) in [
      ('deducted', DeductionStatus.deducted),
      ('confirmed', DeductionStatus.confirmed),
      ('failed', DeductionStatus.failed),
    ]) {
      final raw = recurringData(name),
          period = InstanceDto.fromMap(
            raw['instanceId'] as String,
            raw,
            recurringOwner,
          );
      expect(period.deductionStatus, status);
      expect(period.deductionDate.toString(), '2026-10-04');
      expect(period.localDeductionTime, '09:00');
      expect(period.deductionAt, DateTime.utc(2026, 10, 4, 1));
    }
    final paid = recurringData('payment');
    expect(
      PaymentDto.fromMap(
        paid['paymentId'] as String,
        paid,
        recurringOwner,
      ).provenance,
      PaymentProvenance.assumedAutomatic,
    );
    final raw = recurringData('failureAttempt'),
        attempt = DeductionDto.attempt(
          raw['attemptId'] as String,
          raw,
          recurringOwner,
        );
    expect(attempt.type, DeductionAttemptType.failed);
    expect(attempt.amount!.minorUnits, 54900);
    expect(attempt.reason, 'Card declined');
    expect(attempt.actor, DeductionActor.user);
    final evidence = recurringData('evidence');
    expect(
      DeductionDto.evidence(
        evidence['evidenceId'] as String,
        evidence,
        recurringOwner,
      ).paymentId,
      PaymentId(paid['paymentId'] as String),
    );
    expect(
      () => DeductionDto.attempt(raw['attemptId'] as String, {
        ...raw,
        'actor': 'bank',
      }, recurringOwner),
      throwsA(isA<AppFailure>()),
    );
    expect(
      () => DeductionDto.evidence(evidence['evidenceId'] as String, {
        ...evidence,
        'userId': 'other',
      }, recurringOwner),
      throwsA(isA<AppFailure>()),
    );
  });
}
