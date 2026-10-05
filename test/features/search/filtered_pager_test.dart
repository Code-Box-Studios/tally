import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/foundation.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/search/data/filtered_pager.dart';
import 'package:tally/features/search/domain/query_cancellation.dart';
import 'package:tally/features/search/domain/query_page.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';
import 'package:tally/shared/domain/data_page.dart';

import '../../support/search_gateway.dart';

FilteredPager<String> pager(
  CandidateDocuments docs, {
  Object key = 'matches',
}) => FilteredPager(
  documents: docs,
  criteriaKey: key,
  query: (after) => DocumentQuery('obligations', after: after),
  map: (doc) => doc.id,
  matches: (id) => id.startsWith('yes'),
);
List<RawDocument> rows(int count, Set<int> matching) => [
  for (var i = 0; i < count; i++)
    RawDocument('${matching.contains(i) ? 'yes' : 'no'}-$i', const {}),
];
void main() {
  test('a residual match on the second candidate page is returned', () async {
    final docs = CandidateDocuments(OwnerUid('alice'), rows(90, {75})),
        result = await pager(docs).watchFirst().first;
    expect(result.records.items, ['yes-75']);
    expect(result.scannedCandidates, 90);
    expect(result.records.hasMore, isFalse);
    expect(docs.queries.length, 2);
  });
  test('sparse search stops at250 with a usable continuation instead of false exhaustion', () async {
    final docs = CandidateDocuments(OwnerUid('alice'), rows(300, {280})),
        scan = pager(docs),
        first = await scan.get();
    expect(first.records.items, isEmpty);
    expect(first.scannedCandidates, 250);
    expect(first.budgetReached, isTrue);
    expect(first.records.hasMore, isTrue);
    expect(docs.queries.length, 5);
    final next = await scan.get(after: first.records.nextCursor);
    expect(next.records.items, ['yes-280']);
    expect(next.records.hasMore, isFalse);
  });
  test('all1000 candidates remain reachable with one fetch in flight', () async {
    final docs = CandidateDocuments(OwnerUid('alice'), rows(1000, {900})),
        scan = pager(docs),
        found = <String>[];
    PageCursor? cursor;
    var scanned = 0, more = true;
    final timer = Stopwatch()..start();
    while (more) {
      final result = await scan.get(after: cursor);
      found.addAll(result.records.items);
      scanned += result.scannedCandidates;
      cursor = result.records.nextCursor;
      more = result.records.hasMore;
      expect(result.scannedCandidates, lessThanOrEqualTo(250));
    }
    expect(found, ['yes-900']);
    expect(scanned, 1000);
    expect(docs.queries.length, 20);
    expect(docs.maximumInFlight, 1);
    debugPrint(
      '1000-record search: scanned=$scanned fetches=${docs.queries.length} elapsedMs=${timer.elapsedMilliseconds}',
    );
  });
  test('surplus matching records are buffered without duplicate fetches or lost results', () async {
    final docs = CandidateDocuments(
          OwnerUid('alice'),
          rows(100, {
            ...List.generate(30, (i) => i),
            ...List.generate(30, (i) => i + 50),
          }),
        ),
        scan = pager(docs);
    final first = await scan.get();
    expect(first.records.items.length, 50);
    expect(first.records.hasMore, isTrue);
    final second = await scan.get(after: first.records.nextCursor);
    expect(second.records.items, [for (var i = 70; i < 80; i++) 'yes-$i']);
    expect(second.scannedCandidates, 0);
    expect(second.records.hasMore, isFalse);
    expect(docs.queries.length, 2);
    expect({...first.records.items, ...second.records.items}.length, 60);
  });
  test(
    'cached empty pages remain cache-labelled and do not scan more candidates',
    () async {
      final docs = CandidateDocuments(OwnerUid('alice'), rows(100, {75}))
        ..cached = true;
      final first = await pager(docs).watchFirst().first;
      expect(first.records.items, isEmpty);
      expect(first.records.isFromCache, isTrue);
      expect(first.scannedCandidates, 50);
      expect(docs.queries.length, 1);
      expect(first.records.hasMore, isTrue);
    },
  );
  test(
    'owner and full criteria cursor mismatches fail before another read',
    () async {
      final docs = CandidateDocuments(OwnerUid('alice'), rows(300, {})),
          scan = pager(docs),
          first = await scan.get();
      final count = docs.queries.length;
      await expectLater(
        pager(docs, key: 'other-filter').get(after: first.records.nextCursor),
        throwsA(anything),
      );
      expect(docs.queries.length, count);
      final foreign = CandidateDocuments(OwnerUid('bob'), rows(300, {}));
      await expectLater(
        pager(foreign).get(after: first.records.nextCursor),
        throwsA(anything),
      );
      expect(foreign.queries, isEmpty);
    },
  );
  test('disposing an owner during a pending fetch discards results and starts no next read', () async {
    final docs = CandidateDocuments(OwnerUid('alice'), rows(300, {})),
        pending = Completer<RawPage>();
    docs.onGet = (_) => pending.future;
    final scan = pager(docs), result = scan.get();
    scan.dispose();
    pending.complete(docs.pageFor(DocumentQuery('obligations')));
    await expectLater(result, throwsA(anything));
    expect(docs.queries.length, 1);
  });
  test('explicit cancellation stops a pending search before its next candidate fetch', () async {
    final docs = CandidateDocuments(OwnerUid('alice'), rows(300, {})),
        pending = Completer<RawPage>(),
        cancel = QueryCancellation();
    docs.onGet = (_) => pending.future;
    final result = pager(docs).get(cancellation: cancel);
    cancel.cancel();
    pending.complete(docs.pageFor(DocumentQuery('obligations')));
    await expectLater(result, throwsA(isA<QueryCancelled>()));
    expect(docs.queries.length, 1);
  });
  test(
    'cancelled first-page stream stops advancing after its pending read',
    () async {
      final docs = CandidateDocuments(OwnerUid('alice'), rows(300, {})),
          source = StreamController<RawPage>(),
          pending = Completer<RawPage>();
      docs.source = source.stream;
      docs.onGet = (_) => pending.future;
      final values = <QueryPage<String>>[],
          subscription = pager(docs).watchFirst().listen(values.add);
      source.add(docs.pageFor(DocumentQuery('obligations')));
      await Future<void>.delayed(Duration.zero);
      await subscription.cancel();
      pending.complete(
        docs.pageFor(
          DocumentQuery('obligations', after: const CandidateCursor(50)),
        ),
      );
      await Future<void>.delayed(Duration.zero);
      expect(values, isEmpty);
      expect(docs.queries.length, 2);
      await source.close();
    },
  );
  test(
    'a new first snapshot supersedes an older pending residual scan',
    () async {
      final docs = CandidateDocuments(OwnerUid('alice'), rows(90, {})),
          source = StreamController<RawPage>(),
          pending = Completer<RawPage>();
      docs.source = source.stream;
      docs.onGet = (_) => pending.future;
      final values = <QueryPage<String>>[],
          subscription = pager(docs).watchFirst().listen(values.add);
      source.add(docs.pageFor(DocumentQuery('obligations')));
      await Future<void>.delayed(Duration.zero);
      source.add(
        RawPage(
          documents: [const RawDocument('yes-current', {})],
          nextCursor: null,
          hasMore: false,
          isFromCache: false,
        ),
      );
      pending.complete(
        docs.pageFor(
          DocumentQuery('obligations', after: const CandidateCursor(50)),
        ),
      );
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);
      expect(values.length, 1);
      expect(values.single.records.items, ['yes-current']);
      expect(docs.maximumInFlight, 1);
      await subscription.cancel();
      await source.close();
    },
  );
}
