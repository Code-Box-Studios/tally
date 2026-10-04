import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../core/identifiers/entity_ids.dart';
import '../domain/data_page.dart';
import 'document_reader.dart';
import 'financial_failure_mapper.dart';
import 'owner_command_gateway.dart';
import 'owner_document_gateway.dart';

final class _FirestoreCursor implements PageCursor {
  const _FirestoreCursor(this.owner, this.signature, this.snapshot);
  final OwnerUid owner;
  final String signature;
  final DocumentSnapshot<Map<String, dynamic>> snapshot;
}

final class FirebaseOwnerDocuments implements OwnerDocumentGateway {
  const FirebaseOwnerDocuments(this.firestore, this.owner);
  final FirebaseFirestore firestore;
  @override
  final OwnerUid owner;
  String _signature(DocumentQuery request) => jsonEncode([
    request.collection,
    request.equals,
    request.order.map((order) => [order.field, order.descending]).toList(),
    request.ranges
        .map((range) => [range.field, range.comparison.name, range.value])
        .toList(),
  ]);
  Query<Map<String, dynamic>> _query(DocumentQuery request) {
    Query<Map<String, dynamic>> query = firestore
        .collection('users')
        .doc(owner.value)
        .collection(request.collection);
    for (final filter in request.equals.entries) {
      query = query.where(filter.key, isEqualTo: filter.value);
    }
    for (final range in request.ranges) {
      query = switch (range.comparison) {
        RangeComparison.greaterThan => query.where(
          range.field,
          isGreaterThan: range.value,
        ),
        RangeComparison.greaterThanOrEqual => query.where(
          range.field,
          isGreaterThanOrEqualTo: range.value,
        ),
        RangeComparison.lessThan => query.where(
          range.field,
          isLessThan: range.value,
        ),
        RangeComparison.lessThanOrEqual => query.where(
          range.field,
          isLessThanOrEqualTo: range.value,
        ),
      };
    }
    for (final order in request.order) {
      query = query.orderBy(order.field, descending: order.descending);
    }
    // A document-name tie-breaker gives stable pagination for equal dates.
    query = query.orderBy(
      FieldPath.documentId,
      descending: request.order.isNotEmpty && request.order.last.descending,
    );
    final cursor = request.after;
    if (cursor != null) {
      if (cursor is! _FirestoreCursor ||
          cursor.owner != owner ||
          cursor.signature != _signature(request)) {
        throw ArgumentError('Invalid private page cursor.');
      }
      query = query.startAfterDocument(cursor.snapshot);
    }
    return query.limit(request.limit);
  }

  RawPage _page(
    DocumentQuery request,
    QuerySnapshot<Map<String, dynamic>> snapshot,
  ) {
    final hasMore = snapshot.docs.length == request.limit;
    return RawPage(
      documents: [
        for (final doc in snapshot.docs)
          RawDocument(doc.id, Map<String, Object?>.from(doc.data())),
      ],
      nextCursor: hasMore
          ? _FirestoreCursor(owner, _signature(request), snapshot.docs.last)
          : null,
      hasMore: hasMore,
      isFromCache: snapshot.metadata.isFromCache,
    );
  }

  @override
  Stream<RawPage> watchPage(DocumentQuery request) async* {
    try {
      await for (final snapshot in _query(
        request,
      ).snapshots(includeMetadataChanges: true)) {
        yield _page(request, snapshot);
      }
    } catch (error) {
      throw financialFailure(error);
    }
  }

  @override
  Future<RawPage> getPage(DocumentQuery request) async {
    try {
      return _page(
        request,
        await _query(request).get(const GetOptions(source: Source.server)),
      );
    } catch (error) {
      throw financialFailure(error);
    }
  }

  @override
  Stream<RawRecord> watchDocument(String collection, String id) async* {
    if (!DocumentQuery.collections.contains(collection)) {
      throw ArgumentError('Invalid collection.');
    }
    // Identifiers are validated before forming a Firestore path.
    CommandId(id);
    try {
      await for (final doc
          in firestore
              .collection('users')
              .doc(owner.value)
              .collection(collection)
              .doc(id)
              .snapshots(includeMetadataChanges: true)) {
        yield RawRecord(
          doc.exists
              ? RawDocument(doc.id, Map<String, Object?>.from(doc.data()!))
              : null,
          isFromCache: doc.metadata.isFromCache,
        );
      }
    } catch (error) {
      throw financialFailure(error);
    }
  }
}

final class FirebaseOwnerCommands implements OwnerCommandGateway {
  const FirebaseOwnerCommands(this.functions, this.owner);
  final FirebaseFunctions functions;
  @override
  final OwnerUid owner;
  @override
  Future<Map<String, Object?>> call(
    String name,
    CommandId commandId,
    Map<String, Object?> payload,
  ) async {
    try {
      final result = await functions.httpsCallable(name).call<Object?>({
        'commandId': commandId.value,
        'expectedOwnerUid': owner.value,
        'payload': payload,
      });
      if (result.data is! Map) throw DocumentReader.invalid();
      return Map<String, Object?>.from(result.data as Map);
    } catch (error) {
      throw financialFailure(error);
    }
  }
}
