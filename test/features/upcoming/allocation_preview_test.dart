import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/errors/app_failure.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/core/money/money.dart';
import 'package:tally/features/obligations/data/instance_dto.dart';
import 'package:tally/features/payments/domain/allocation_preview.dart';
import 'package:tally/features/payments/domain/payment_entry.dart';

import '../../support/upcoming_fixtures.dart';

void main() {
  final owner = OwnerUid('alice');
  Money money(int amount) => Money.fromMinorUnits(amount, CurrencyCode.php);
  test('payment preview allocates by earliest date and identity with a partial final period', () {
    final instances = [
      InstanceDto.fromMap(
        'later',
        instanceData('later', due: '2026-11-15'),
        owner,
      ),
      InstanceDto.fromMap('b', instanceData('b', due: '2026-10-15'), owner),
      InstanceDto.fromMap('a', instanceData('a', due: '2026-10-15'), owner),
    ];
    final result = AllocationPreview.forPayment(money(15000), instances);
    expect(result.map((a) => a.instanceId.value), ['a', 'b']);
    expect(result.map((a) => a.amount.minorUnits), [10000, 5000]);
    expect(
      () => AllocationPreview.forPayment(money(30001), instances),
      throwsA(isA<AppFailure>()),
    );
    expect(
      () => AllocationPreview.forPayment(
        Money.fromMinorUnits(1, CurrencyCode.usd),
        instances,
      ),
      throwsA(isA<AppFailure>()),
    );
  });
  test('correction preview restores exact original periods before allocating the replacement', () {
    final instances = [
      InstanceDto.fromMap('early', {
        ...instanceData('early', due: '2026-10-15'),
        'totalPaidMinor': 10000,
        'remainingMinor': 0,
        'closed': true,
        'financialStatus': 'paid',
      }, owner),
      InstanceDto.fromMap(
        'late',
        instanceData('late', due: '2026-11-15'),
        owner,
      ),
    ];
    final result = AllocationPreview.forPayment(
      money(7000),
      instances,
      restore: [PaymentAllocation(InstanceId('early'), money(10000))],
    );
    expect(result.single.instanceId.value, 'early');
    expect(result.single.amount.minorUnits, 7000);
    expect(
      () => AllocationPreview.forPayment(
        money(1),
        instances,
        restore: [PaymentAllocation(InstanceId('early'), money(10001))],
      ),
      throwsA(isA<AppFailure>()),
    );
  });
  test('preview rejects partial schedules and never silently truncates a payment spanning more than 24 periods', () {
    final instances = [
      for (var i = 0; i < 25; i++)
        InstanceDto.fromMap('period-$i', instanceData('period-$i'), owner),
    ];
    expect(
      () => AllocationPreview.forPayment(money(250000), instances),
      throwsA(isA<AppFailure>()),
    );
    expect(
      () => AllocationPreview.forPayment(
        money(1),
        instances,
        expectedInstanceIds: [
          ...instances.map((i) => i.id),
          InstanceId('missing'),
        ],
      ),
      throwsA(isA<AppFailure>()),
    );
    final forged = InstanceDto.fromMap('foreign', {
      ...instanceData('foreign'),
      'obligationId': 'other-loan',
    }, owner);
    expect(
      () => AllocationPreview.forPayment(money(1), [...instances, forged]),
      throwsA(isA<AppFailure>()),
    );
  });
  test('period history remains marked even after its payment is reversed', () {
    final instance = InstanceDto.fromMap('first', {
      ...instanceData('first'),
      'hasPaymentHistory': true,
    }, owner);
    expect(instance.hasPaymentHistory, isTrue);
    expect(
      InstanceDto.fromMap(
        'legacy',
        instanceData('legacy'),
        owner,
      ).hasPaymentHistory,
      isNull,
    );
  });
}
