import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/errors/app_failure.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/obligations/domain/installment_periods.dart';
import 'package:tally/features/obligations/data/instance_dto.dart';
import 'package:tally/features/obligations/data/obligation_dto.dart';

import '../../support/upcoming_fixtures.dart';
import '../financial/financial_dto_test.dart' show obligationData;

void main() {
  test('a finite installment view requires every owned period and conserved parent balances', () {
    final owner = OwnerUid('alice');
    final parent = ObligationDto.fromMap('loan-1', {
      ...obligationData(),
      'type': 'installment',
      'singleInstanceId': null,
      'installmentInstanceIds': ['first', 'second'],
      'originalAmountMinor': 20000,
      'totalPaidMinor': 0,
      'remainingMinor': 20000,
    }, owner);
    final periods = [
      for (final id in ['first', 'second'])
        InstanceDto.fromMap(id, instanceData(id), owner),
    ];
    expect(InstallmentPeriods.checked(parent, periods).length, 2);
    expect(
      () => InstallmentPeriods.checked(parent, [periods.first]),
      throwsA(isA<AppFailure>()),
    );
    expect(
      () => InstallmentPeriods.checked(parent, [periods.first, periods.first]),
      throwsA(isA<AppFailure>()),
    );
    final changed = InstanceDto.fromMap('second', {
      ...instanceData('second'),
      'totalPaidMinor': 5000,
      'remainingMinor': 5000,
    }, owner);
    expect(
      () => InstallmentPeriods.checked(parent, [periods.first, changed]),
      throwsA(isA<AppFailure>()),
    );
  });
}
