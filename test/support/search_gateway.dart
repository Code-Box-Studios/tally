import 'dart:async';

import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';
import 'package:tally/shared/domain/data_page.dart';

final class CandidateCursor implements PageCursor {
  const CandidateCursor(this.offset);
  final int offset;
}

final class CandidateDocuments implements OwnerDocumentGateway {
  CandidateDocuments(this.owner, this.candidates);
  @override
  final OwnerUid owner;
  final List<RawDocument> candidates;
  final queries = <DocumentQuery>[];
  bool cached = false;
  Stream<RawPage>? source;
  Future<RawPage> Function(DocumentQuery)? onGet;
  int inFlight = 0, maximumInFlight = 0;

  RawPage pageFor(DocumentQuery query) {
    final rows = candidates.where(
      (doc) => query.equals.entries.every((e) => doc.data[e.key] == e.value),
    );
    final offset = query.after == null
        ? 0
        : (query.after! as CandidateCursor).offset;
    final page = rows.skip(offset).take(query.limit).toList(),
        more = rows.length > offset + page.length;
    return RawPage(
      documents: page,
      nextCursor: more ? CandidateCursor(offset + page.length) : null,
      hasMore: more,
      isFromCache: cached,
    );
  }

  @override
  Stream<RawPage> watchPage(DocumentQuery query) {
    queries.add(query);
    return source ?? Stream.value(pageFor(query));
  }

  @override
  Future<RawPage> getPage(DocumentQuery query) async {
    queries.add(query);
    inFlight++;
    if (inFlight > maximumInFlight) maximumInFlight = inFlight;
    try {
      return onGet == null ? pageFor(query) : await onGet!(query);
    } finally {
      inFlight--;
    }
  }

  @override
  Stream<RawRecord> watchDocument(String collection, String id) =>
      Stream.value(const RawRecord(null, isFromCache: false));
}
