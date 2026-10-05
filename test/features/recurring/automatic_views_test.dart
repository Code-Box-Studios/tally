import 'package:flutter_test/flutter_test.dart';
import 'package:tally/features/activity/data/activity_dto.dart';
import 'package:tally/features/activity/domain/activity_entry.dart';
import 'package:tally/features/recurring/domain/deduction_attempt.dart';

import '../../support/recurring_fixtures.dart';

void main() {
  test('automatic states have explicit labels including paid manually', () {
    expect(DeductionStatus.expected.label, 'Awaiting confirmation');
    expect(DeductionStatus.deducted.label, 'Assumed deducted');
    expect(DeductionStatus.confirmed.label, 'Confirmed');
    expect(DeductionStatus.failed.label, 'Automatic deduction failed');
    expect(DeductionStatus.resolved.label, 'Paid manually');
  });
  test('actual recurring activity maps expected unknown amounts and meaningful action labels', () {
    final values = recurringFixtures['activities'] as List;
    final activities = [
      for (final raw in values)
        ActivityDto.fromMap(
          (raw as Map)['id'] as String,
          Map<String, Object?>.from(raw),
          recurringOwner,
        ),
    ];
    expect(
      activities
          .where((a) => a.type == ActivityType.automaticPaymentConfirmed)
          .single
          .type
          .label,
      'Automatic deduction confirmed',
    );
    final expected = activities
        .where((a) => a.type == ActivityType.automaticPaymentExpected)
        .single;
    expect(expected.amount, isNull);
    expect(expected.type.label, 'Automatic deduction expected');
  });
}
