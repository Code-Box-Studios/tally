import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/features/obligations/data/obligation_dto.dart';
import 'package:tally/features/people/domain/contact_position.dart';

import 'financial_dto_test.dart' show obligationData;

void main() {
  test('contact position keeps opposite loans independent and every currency separate', () {
    final data = obligationData();
    final outgoing = ObligationDto.fromMap('loan-1', data, OwnerUid('alice'));
    final incoming = ObligationDto.fromMap('loan-2', {
      ...data,
      'obligationId': 'loan-2',
      'type': 'owedToMe',
      'direction': 'owedToMe',
      'section': 'owedToMe',
      'originalAmountMinor': 500000,
      'totalPaidMinor': 200000,
      'remainingMinor': 300000,
    }, OwnerUid('alice'));
    final usd = ObligationDto.fromMap('loan-usd', {
      ...data,
      'obligationId': 'loan-usd',
      'currency': 'USD',
      'originalAmountMinor': 50000,
      'totalPaidMinor': 0,
      'remainingMinor': 50000,
    }, OwnerUid('alice'));
    final cancelled = ObligationDto.fromMap('loan-cancel', {
      ...data,
      'obligationId': 'loan-cancel',
      'lifecycle': 'cancelled',
    }, OwnerUid('alice'));
    final result = ContactPositionCalculator.calculate([
      outgoing,
      incoming,
      usd,
      cancelled,
    ]);
    expect(result[CurrencyCode.php]!.youOwe.minorUnits, 700000);
    expect(result[CurrencyCode.php]!.owedToYou.minorUnits, 300000);
    expect(result[CurrencyCode.php]!.net.minorUnits, -400000);
    expect(result[CurrencyCode.usd]!.youOwe.minorUnits, 50000);
    expect(outgoing.remainingAmount!.minorUnits, 700000);
    expect(incoming.remainingAmount!.minorUnits, 300000);
  });
}
