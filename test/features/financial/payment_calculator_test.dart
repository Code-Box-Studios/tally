import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/money/money.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/features/payments/data/payment_dto.dart';
import 'package:tally/features/payments/domain/payment_calculator.dart';

import 'financial_dto_test.dart' show paymentData;

void main() {
  final original = Money.parse('20000', CurrencyCode.php);
  final owner = OwnerUid('alice');
  test(
    'multiple immutable partial payments leave the exact remaining amount',
    () {
      final entries = [
        for (final (id, amount) in [
          ('a', 500000),
          ('b', 250000),
          ('c', 400000),
        ])
          PaymentDto.fromMap(id, {
            ...paymentData(),
            'paymentId': id,
            'amountMinor': amount,
            'allocations': [
              {'instanceId': 'instance-1', 'amountMinor': amount},
            ],
          }, owner),
      ];
      final balance = PaymentCalculator.balance(original, entries);
      expect(balance.paid.minorUnits, 1150000);
      expect(balance.remaining.minorUnits, 850000);
    },
  );
  test('reversal can precede its original in descending paginated history', () {
    final base = paymentData();
    final payment = PaymentDto.fromMap('pay-1', base, owner);
    final reversal = PaymentDto.fromMap('undo', {
      ...base,
      'paymentId': 'undo',
      'entryType': 'reversal',
      'reversesPaymentId': 'pay-1',
      'correctionGroupId': 'fix',
      'correctionReason': 'Wrong entry',
    }, owner);
    expect(
      PaymentCalculator.balance(original, [reversal, payment]).remaining,
      original,
    );
    expect(
      () => PaymentCalculator.balance(original, [reversal]),
      throwsException,
    );
    expect(
      () => PaymentCalculator.balance(original, [payment, payment]),
      throwsException,
    );
  });
  test('currency separation and overpayment are never silently accepted', () {
    final usd = PaymentDto.fromMap('usd', {
      ...paymentData(),
      'paymentId': 'usd',
      'currency': 'USD',
    }, owner);
    expect(() => PaymentCalculator.balance(original, [usd]), throwsException);
    final huge = PaymentDto.fromMap('huge', {
      ...paymentData(),
      'paymentId': 'huge',
      'amountMinor': 2500000,
      'allocations': [
        {'instanceId': 'instance-1', 'amountMinor': 2500000},
      ],
    }, owner);
    expect(() => PaymentCalculator.balance(original, [huge]), throwsException);
  });
}
