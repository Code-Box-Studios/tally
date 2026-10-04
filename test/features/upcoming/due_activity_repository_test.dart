import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/features/obligations/domain/due_query.dart';
import 'package:tally/features/obligations/data/firestore_due_repository.dart';
import 'package:tally/features/activity/data/firestore_activity_repository.dart';
import 'package:tally/features/activity/domain/activity_entry.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';
import 'package:tally/shared/domain/financial_failure.dart';

import '../../support/upcoming_fixtures.dart';
import '../financial/financial_dto_test.dart' show audit;

void main() {
  final owner = OwnerUid('alice');
  test('due query covers saved timezone boundaries and skips empty residual pages without truncation', () async {
    final docs = UpcomingDocuments(owner)
      ..pages.addAll([
        RawPage(
          documents: [
            RawDocument('old', instanceData('old', due: '2026-09-01')),
          ],
          nextCursor: const FixtureCursor(1),
          hasMore: true,
          isFromCache: false,
        ),
        RawPage(
          documents: [
            RawDocument(
              'hawaii',
              instanceData(
                'hawaii',
                due: '2026-10-03',
                timezone: 'Pacific/Honolulu',
              ),
            ),
          ],
          nextCursor: null,
          hasMore: false,
          isFromCache: false,
        ),
      ]);
    final request = DueQuery(
      group: DueGroup.today,
      now: DateTime.utc(2026, 10, 4, 0, 1),
      currency: CurrencyCode.php,
    );
    final result = await FirestoreDueRepository(
      docs,
      UpcomingCommands(owner),
    ).watchDue(request).first;
    expect(result.items.single.id.value, 'hawaii');
    expect(result.hasMore, isFalse);
    expect(docs.queries.length, 2);
    expect(docs.queries.first.equals['closed'], false);
    expect(docs.queries.first.order.single.field, 'dueDate');
    final envelope = request.envelope;
    expect(envelope.first!.toString(), '2026-10-03');
    expect(envelope.last.toString(), '2026-10-05');
  });
  test(
    'cached empty due pages remain marked cached until a server snapshot',
    () async {
      final docs = UpcomingDocuments(owner)
        ..pages.add(
          RawPage(
            documents: [
              RawDocument('old', instanceData('old', due: '2026-09-01')),
            ],
            nextCursor: const FixtureCursor(1),
            hasMore: true,
            isFromCache: true,
          ),
        );
      final request = DueQuery(
        group: DueGroup.today,
        now: DateTime.utc(2026, 10, 4),
      );
      final result = await FirestoreDueRepository(
        docs,
        UpcomingCommands(owner),
      ).watchDue(request).first;
      expect(result.items, isEmpty);
      expect(result.isFromCache, isTrue);
      expect(result.hasMore, isTrue);
      expect(docs.queries.length, 1);
    },
  );
  test('activity pages keep native amounts immutable event identity and safe labels', () async {
    final docs = UpcomingDocuments(owner)
      ..pages.addAll([
        RawPage(
          documents: [
            RawDocument('activity-1', {
              ...audit,
              'type': 'paymentMade',
              'title': 'Personal loan',
              'obligationId': 'loan-1',
              'paymentId': 'pay-1',
              'amountMinor': 300000,
              'currency': 'PHP',
              'direction': 'owedByMe',
              'recordedAt': DateTime.utc(2026, 10, 4),
            }),
          ],
          nextCursor: const FixtureCursor(1),
          hasMore: true,
          isFromCache: false,
        ),
        RawPage(
          documents: [
            RawDocument('activity-2', {
              ...audit,
              'type': 'paymentCorrected',
              'title': 'Personal loan',
              'obligationId': 'loan-1',
              'paymentId': 'pay-1',
              'amountMinor': 300000,
              'currency': 'PHP',
              'reason': 'Duplicate entry',
              'direction': 'owedByMe',
              'recordedAt': DateTime.utc(2026, 10, 3),
            }),
          ],
          nextCursor: null,
          hasMore: false,
          isFromCache: false,
        ),
      ]);
    final repository = FirestoreActivityRepository(
      docs,
      UpcomingCommands(owner),
    );
    final first = await repository.watchActivity().first;
    expect(first.items.single.type, ActivityType.paymentMade);
    expect(first.items.single.amount!.minorUnits, 300000);
    expect(docs.queries.first.order.single.field, 'createdAt');
    expect(docs.queries.first.order.single.descending, isTrue);
    final second = await repository.getActivity(after: first.nextCursor);
    expect(second.items.single.type, ActivityType.paymentCorrected);
    expect(second.hasMore, isFalse);
    docs.failPages = true;
    await expectLater(
      repository.getActivity(),
      throwsA(isA<FinancialFailure>()),
    );
  });
}
