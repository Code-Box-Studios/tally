import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/obligations/data/obligation_dto.dart';
import 'package:tally/features/payments/data/payment_dto.dart';
import 'package:tally/shared/data/catalog_dto.dart';
import 'package:tally/core/errors/app_failure.dart';

final audit = {
  'userId': 'alice',
  'schemaVersion': 1,
  'createdAt': DateTime.utc(2026, 10, 4),
  'updatedAt': DateTime.utc(2026, 10, 4),
};
Map<String, Object?> obligationData() => {
  ...audit,
  'obligationId': 'loan-1',
  'type': 'owedByMe',
  'direction': 'owedByMe',
  'section': 'iOwe',
  'title': 'Personal loan',
  'description': 'Borrowed',
  'notes': '',
  'contactId': null,
  'contactSnapshot': null,
  'categoryId': 'default-personal-loan',
  'categorySnapshot': {'name': 'Personal Loan'},
  'currency': 'PHP',
  'originalAmountMinor': 1000000,
  'totalPaidMinor': 300000,
  'remainingMinor': 700000,
  'defaultAmountMinor': null,
  'amountKind': 'fixed',
  'originationDate': '2026-01-01',
  'dueDate': '2026-10-15',
  'nextDueDate': '2026-10-15',
  'lifecycle': 'active',
  'financialStatus': 'partiallyPaid',
  'paymentMode': 'manual',
  'paymentSourceId': null,
  'sourceSnapshot': null,
  'recurrence': null,
  'interestInfo': null,
  'archived': false,
  'hasPaymentHistory': true,
  'singleInstanceId': 'instance-1',
  'revision': 2,
};
Map<String, Object?> paymentData() => {
  ...audit,
  'paymentId': 'pay-1',
  'obligationId': 'loan-1',
  'obligationInstanceId': 'instance-1',
  'allocations': [
    {'instanceId': 'instance-1', 'amountMinor': 300000},
  ],
  'entryType': 'payment',
  'amountMinor': 300000,
  'currency': 'PHP',
  'paymentDate': '2026-01-02',
  'paymentTimezone': 'Asia/Manila',
  'paidAt': null,
  'paymentSourceId': null,
  'sourceSnapshot': null,
  'paymentMethod': 'cash',
  'provenance': 'manual',
  'direction': 'owedByMe',
  'contactId': null,
  'categoryId': 'default-personal-loan',
  'notes': '',
  'receiptAttachmentId': null,
  'commandId': 'command-1',
  'eventKey': null,
  'reversesPaymentId': null,
  'correctionGroupId': null,
  'correctionReason': null,
  'recordedAt': DateTime.utc(2026, 10, 4),
};
void main() {
  test(
    'finite obligation DTO validates balance and preserves null due dates',
    () {
      final result = ObligationDto.fromMap(
        'loan-1',
        obligationData(),
        OwnerUid('alice'),
      );
      expect(result.remainingAmount!.minorUnits, 700000);
      expect(result.paidAmount!.minorUnits, 300000);
      expect(result.currency.code, 'PHP');
      expect(
        ObligationDto.fromMap('loan-1', {
          ...obligationData(),
          'dueDate': null,
          'nextDueDate': null,
        }, OwnerUid('alice')).dueDate,
        isNull,
      );
    },
  );
  test('owner schema IDs money dates and enums cannot become invented financial values', () {
    for (final patch in <Map<String, Object?>>[
      {'userId': 'bob'},
      {'schemaVersion': 2},
      {'obligationId': 'different'},
      {'remainingMinor': -1},
      {'remainingMinor': 600000},
      {'originalAmountMinor': 1.5},
      {'currency': 'XYZ'},
      {'financialStatus': 'unknown'},
      {'dueDate': '2026-02-30'},
      {'paymentMode': 'bankLinked'},
    ]) {
      expect(
        () => ObligationDto.fromMap('loan-1', {
          ...obligationData(),
          ...patch,
        }, OwnerUid('alice')),
        throwsA(isA<AppFailure>()),
      );
    }
  });
  test('payment DTO verifies immutable allocation sum and reversal link', () {
    final result = PaymentDto.fromMap(
      'pay-1',
      paymentData(),
      OwnerUid('alice'),
    );
    expect(result.amount.minorUnits, 300000);
    for (final patch in <Map<String, Object?>>[
      {'userId': 'bob'},
      {'entryType': 'future'},
      {'amountMinor': 0},
      {
        'allocations': [
          {'instanceId': 'instance-1', 'amountMinor': 1},
        ],
      },
      {'entryType': 'reversal', 'reversesPaymentId': null},
    ]) {
      expect(
        () => PaymentDto.fromMap('pay-1', {
          ...paymentData(),
          ...patch,
        }, OwnerUid('alice')),
        throwsA(isA<AppFailure>()),
      );
    }
  });
  test('source labels cannot be interpreted as credentials or an unknown source type', () {
    final source = {
      ...audit,
      'name': 'Visa',
      'type': 'creditCard',
      'nickname': null,
      'lastFour': '1234',
      'notes': '',
      'active': true,
      'revision': 1,
    };
    expect(
      CatalogDto.source('visa', source, OwnerUid('alice')).lastFour,
      '1234',
    );
    expect(
      () => CatalogDto.source('visa', {
        ...source,
        'lastFour': '12345',
      }, OwnerUid('alice')),
      throwsA(isA<AppFailure>()),
    );
    expect(
      () => CatalogDto.source('visa', {
        ...source,
        'type': 'credential',
      }, OwnerUid('alice')),
      throwsA(isA<AppFailure>()),
    );
  });
}
