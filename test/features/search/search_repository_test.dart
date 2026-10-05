import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/dates/local_date.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/features/obligations/domain/obligation.dart';
import 'package:tally/features/search/data/query_planner.dart';
import 'package:tally/features/search/data/firestore_search_repository.dart';
import 'package:tally/features/search/domain/financial_filter.dart';
import 'package:tally/features/search/domain/period_query.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';

import '../../support/recurring_fixtures.dart';
import '../../support/search_gateway.dart';
import '../financial/financial_dto_test.dart' show obligationData;

void main() {
  final now = DateTime.utc(2026, 10, 5, 4);
  test('query planner uses one selective primary equality and keeps date constraints', () {
    final filter = FinancialFilter(
      contactId: ContactId('john'),
      categoryId: CategoryId('utilities'),
      sourceId: SourceId('card'),
      currency: CurrencyCode.php,
      section: ObligationSection.monthlyDues,
      paymentMode: PaymentMode.automatic,
      firstDate: LocalDate.parse('2026-10-01'),
      lastDate: LocalDate.parse('2026-10-31'),
    );
    final parents = QueryPlanner.obligations(filter),
        periods = QueryPlanner.periods(PeriodQuery(now: now, filter: filter));
    expect(parents.equals, {'archived': false, 'contactId': 'john'});
    expect(parents.order.single.field, 'createdAt');
    expect(parents.order.single.descending, isTrue);
    expect(periods.equals, {'contactId': 'john'});
    expect(periods.order.single.field, 'dueDate');
    expect(periods.ranges.map((r) => r.value), ['2026-10-01', '2026-10-31']);
    expect(periods.limit, 50);
  });
  final priorities = <String, FinancialFilter>{
    'categoryId': FinancialFilter(
      categoryId: CategoryId('utilities'),
      sourceId: SourceId('card'),
      currency: CurrencyCode.php,
    ),
    'paymentSourceId': FinancialFilter(
      sourceId: SourceId('card'),
      currency: CurrencyCode.php,
    ),
    'currency': FinancialFilter(
      currency: CurrencyCode.php,
      section: ObligationSection.iOwe,
    ),
    'section': FinancialFilter(
      section: ObligationSection.iOwe,
      paymentMode: PaymentMode.manual,
    ),
    'paymentMode': FinancialFilter(paymentMode: PaymentMode.manual),
  };
  for (final entry in priorities.entries) {
    test('${entry.key} primary wins over lower-priority residual criteria', () {
      expect(
        QueryPlanner.periods(PeriodQuery(now: now, filter: entry.value))
            .equals
            .keys,
        [entry.key],
      );
      expect(QueryPlanner.obligations(entry.value).equals.keys, [
        'archived',
        entry.key,
      ]);
    });
  }
  test(
    'text and amount residuals are evaluated across later owned pages',
    () async {
      final rows = [
        for (var i = 0; i < 90; i++)
          RawDocument('loan-$i', {
            ...obligationData(),
            'obligationId': 'loan-$i',
            'title': i == 75 ? 'Family loan' : 'Other loan',
            'categoryId': 'family',
            'categorySnapshot': {'name': 'Family'},
          }),
      ];
      final docs = CandidateDocuments(OwnerUid('alice'), rows),
          repository = FirestoreSearchRepository(docs);
      final result = await repository.getObligations(
        FinancialFilter(
          currency: CurrencyCode.php,
          text: 'family',
          minimumMinor: 1000000,
          categoryId: CategoryId('family'),
        ),
        now,
      );
      // Every category label matches family, so title-specific input pins the intended single match.
      expect(result.records.items.length, 50);
      final chosen = await repository.getObligations(
        FinancialFilter(
          currency: CurrencyCode.php,
          text: 'family loan',
          minimumMinor: 1000000,
        ),
        now,
      );
      expect(chosen.records.items.single.id.value, 'loan-75');
      expect(chosen.scannedCandidates, 90);
      repository.dispose();
    },
  );
  test(
    'period mapping preserves unknown money and selected saved labels',
    () async {
      final raw = recurringData('variable'),
          docs = CandidateDocuments(recurringOwner, [
            RawDocument(raw['instanceId'] as String, raw),
          ]),
          repository = FirestoreSearchRepository(docs);
      final result = await repository.getPeriods(
        PeriodQuery(
          now: now,
          filter: FinancialFilter(
            status: RecordStatus.pending,
            text: 'electricity',
          ),
        ),
      );
      expect(result.records.items.single.amount, isNull);
      expect(result.records.items.single.estimatedAmount!.minorUnits, 350000);
      repository.dispose();
    },
  );
  test('a disjoint calendar period query performs no read', () async {
    final docs = CandidateDocuments(OwnerUid('alice'), []),
        repository = FirestoreSearchRepository(docs);
    final result = await repository.getPeriods(
      PeriodQuery(now: now, empty: true),
    );
    expect(result.records.items, isEmpty);
    expect(docs.queries, isEmpty);
    repository.dispose();
  });
  test(
    'a saved-zone day change rejects an existing continuation before reading',
    () async {
      final docs = CandidateDocuments(recurringOwner, [
            for (var i = 0; i < 300; i++)
              RawDocument('period-$i', {
                ...recurringData('variable'),
                'instanceId': 'period-$i',
              }),
          ]),
          repository = FirestoreSearchRepository(docs);
      final first = await repository.getPeriods(
            PeriodQuery(
              now: DateTime.utc(2026, 10, 5, 7, 40),
              filter: FinancialFilter(text: 'absent'),
            ),
          ),
          count = docs.queries.length;
      await expectLater(
        repository.getPeriods(
          PeriodQuery(
            now: DateTime.utc(2026, 10, 5, 8),
            filter: FinancialFilter(text: 'absent'),
          ),
          after: first.records.nextCursor,
        ),
        throwsA(anything),
      );
      expect(docs.queries.length, count);
      repository.dispose();
    },
  );
}
