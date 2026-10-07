import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/activity/data/activity_dto.dart';

import '../financial/financial_dto_test.dart' show audit;

void main() {
  test('file evidence cannot masquerade as a monetary transaction', () {
    expect(
      () => ActivityDto.fromMap('forged-1', {
        ...audit,
        'type': 'attachmentReady',
        'title': 'Personal loan',
        'obligationId': 'loan-1',
        'amountMinor': 100,
        'currency': 'PHP',
        'recordedAt': DateTime.utc(2026, 10, 7),
      }, OwnerUid('alice')),
      throwsA(anything),
    );
  });
  test(
    'ready file activity accepts its actual server shape without monetary keys',
    () {
      final event = ActivityDto.fromMap('ready-1', {
        ...audit,
        'type': 'attachmentReady',
        'title': 'Personal loan',
        'obligationId': 'loan-1',
        'attachmentId': 'file-1',
        'targetType': 'payment',
        'targetId': 'payment-1',
        'recordedAt': DateTime.utc(2026, 10, 7),
      }, OwnerUid('alice'));
      expect(event.type.name, 'attachmentReady');
      expect(event.amount, isNull);
    },
  );
  for (final entry in {
    'attachmentAdded': 'File added',
    'attachmentReady': 'File ready',
    'attachmentRemoved': 'File removed',
  }.entries) {
    test(
      '${entry.key} is human readable without inventing a financial transaction',
      () {
        final event = ActivityDto.fromMap('activity-1', {
          ...audit,
          'type': entry.key,
          'title': 'receipt.pdf',
          'obligationId': 'loan-1',
          'amountMinor': null,
          'currency': null,
          'recordedAt': DateTime.utc(2026, 10, 7),
        }, OwnerUid('alice'));
        expect(event.type.name, entry.key);
        expect(event.type.label, entry.value);
        expect(event.amount, isNull);
      },
    );
  }
}
