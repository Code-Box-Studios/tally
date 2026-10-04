import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/shared/domain/data_page.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';
import 'package:tally/shared/data/owner_command_gateway.dart';
import 'package:tally/features/obligations/data/firestore_obligations_repository.dart';

import 'financial_dto_test.dart' show obligationData;

class OffsetCursor implements PageCursor {
  OffsetCursor(this.offset);
  final int offset;
}

class FakeDocuments implements OwnerDocumentGateway {
  FakeDocuments(this.owner, {this.count = 62});
  @override
  final OwnerUid owner;
  final int count;
  final queries = <DocumentQuery>[];
  RawPage page(DocumentQuery query) {
    queries.add(query);
    final start = (query.after as OffsetCursor?)?.offset ?? 0;
    final end = (start + query.limit).clamp(0, count);
    return RawPage(
      documents: [
        for (var i = start; i < end; i++)
          RawDocument('loan-$i', {
            ...obligationData(),
            'userId': owner.value,
            'obligationId': 'loan-$i',
          }),
      ],
      nextCursor: end < count ? OffsetCursor(end) : null,
      hasMore: end < count,
      isFromCache: false,
    );
  }

  @override
  Stream<RawPage> watchPage(DocumentQuery query) => Stream.value(page(query));
  @override
  Future<RawPage> getPage(DocumentQuery query) async => page(query);
  @override
  Stream<RawRecord> watchDocument(String collection, String id) => Stream.value(
    RawRecord(
      RawDocument(id, {
        ...obligationData(),
        'userId': owner.value,
        'obligationId': id,
      }),
      isFromCache: false,
    ),
  );
}

class FakeCommands implements OwnerCommandGateway {
  FakeCommands(this.owner);
  @override
  final OwnerUid owner;
  final commandIds = <CommandId>[];
  Completer<Map<String, Object?>>? pending;
  bool failNext = false;
  @override
  Future<Map<String, Object?>> call(
    String name,
    CommandId commandId,
    Map<String, Object?> payload,
  ) async {
    commandIds.add(commandId);
    if (failNext) {
      failNext = false;
      throw StateError('Connection unavailable');
    }
    if (pending != null) return pending!.future;
    return {
      'obligationId': 'loan-new',
      'obligationInstanceId': 'instance-new',
      'obligationRevision': 1,
      'instanceRevision': 1,
    };
  }
}

void main() {
  test(
    'repository exposes more than the first fifty owner-scoped records',
    () async {
      final docs = FakeDocuments(OwnerUid('alice'));
      final repository = FirestoreObligationsRepository(
        docs,
        FakeCommands(docs.owner),
      );
      final first = await repository.watchObligations().first;
      expect(first.items.length, 50);
      expect(first.hasMore, isTrue);
      expect(first.isFromCache, isFalse);
      final second = await repository.getObligations(after: first.nextCursor);
      expect(second.items.length, 12);
      expect(second.hasMore, isFalse);
      expect(
        {
          ...first.items.map((item) => item.id),
          ...second.items.map((item) => item.id),
        }.length,
        62,
      );
      expect(docs.queries.every((query) => query.limit <= 200), isTrue);
    },
  );
  test('repository cannot bind reads to one owner and commands to another', () {
    expect(
      () => FirestoreObligationsRepository(
        FakeDocuments(OwnerUid('alice')),
        FakeCommands(OwnerUid('bob')),
      ),
      throwsArgumentError,
    );
  });
  test('unbounded query requests fail explicitly', () {
    expect(() => DocumentQuery('obligations', limit: 0), throwsArgumentError);
    expect(() => DocumentQuery('obligations', limit: 201), throwsArgumentError);
  });
}
