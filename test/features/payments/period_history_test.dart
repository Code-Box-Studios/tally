import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/payments/data/firestore_payments_repository.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';

import '../../support/recurring_fixtures.dart';
import '../../support/search_gateway.dart';
import '../../support/upcoming_fixtures.dart';

void main() {
  test('selected recurring history returns its original reversal replacement and excludes other months', () async {
    final original = recurringData('payment'),
        parent = ObligationId(original['obligationId'] as String),
        period = InstanceId(original['obligationInstanceId'] as String);
    final docs = CandidateDocuments(recurringOwner, [
          RawDocument(original['paymentId'] as String, original),
          RawDocument('reversal', {
            ...original,
            'paymentId': 'reversal',
            'entryType': 'reversal',
            'reversesPaymentId': original['paymentId'],
            'correctionGroupId': 'correction',
            'correctionReason': 'Mistake',
            'eventKey': null,
          }),
          RawDocument('replacement', {
            ...original,
            'paymentId': 'replacement',
            'provenance': 'manual',
            'eventKey': null,
          }),
          RawDocument('other-month', {
            ...original,
            'paymentId': 'other-month',
            'obligationInstanceId': 'other-period',
            'allocations': [
              {
                'instanceId': 'other-period',
                'amountMinor': original['amountMinor'],
              },
            ],
          }),
        ]),
        repository = FirestorePaymentsRepository(
          docs,
          UpcomingCommands(recurringOwner),
        );
    final result = await repository.watchPeriodPayments(parent, period).first;
    expect(result.items.map((p) => p.id.value), [
      original['paymentId'],
      'reversal',
      'replacement',
    ]);
    expect(docs.queries.single.equals, {
      'obligationId': parent.value,
      'obligationInstanceId': period.value,
    });
    expect(docs.queries.single.order.map((o) => o.field), [
      'paymentDate',
      'createdAt',
    ]);
    expect(docs.queries.single.order.every((o) => o.descending), isTrue);
  });
  test(
    'period history cursor cannot continue another owner or period',
    () async {
      final raw = recurringData('payment'),
          parent = ObligationId(raw['obligationId'] as String),
          period = InstanceId(raw['obligationInstanceId'] as String),
          docs = CandidateDocuments(recurringOwner, [
            for (var i = 0; i < 60; i++)
              RawDocument('payment-$i', {...raw, 'paymentId': 'payment-$i'}),
          ]),
          repository = FirestorePaymentsRepository(
            docs,
            UpcomingCommands(recurringOwner),
          );
      final first = await repository.getPeriodPayments(parent, period),
          count = docs.queries.length;
      await expectLater(
        repository.getPeriodPayments(
          parent,
          InstanceId('other'),
          after: first.nextCursor,
        ),
        throwsA(anything),
      );
      expect(docs.queries.length, count);
      final other = CandidateDocuments(OwnerUid('bob'), []);
      await expectLater(
        FirestorePaymentsRepository(
          other,
          UpcomingCommands(other.owner),
        ).getPeriodPayments(parent, period, after: first.nextCursor),
        throwsA(anything),
      );
      expect(other.queries, isEmpty);
      final next = await repository.getPeriodPayments(
        parent,
        period,
        after: first.nextCursor,
      );
      expect(next.items.length, 10);
      expect(docs.queries.last.after, isA<CandidateCursor>());
    },
  );
}
