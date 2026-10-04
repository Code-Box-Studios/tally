import '../../core/identifiers/entity_ids.dart';
import '../domain/data_page.dart';

final class RawDocument {
  const RawDocument(this.id, this.data);
  final String id;
  final Map<String, Object?> data;
}

final class RawPage {
  RawPage({
    required List<RawDocument> documents,
    required this.nextCursor,
    required this.hasMore,
    required this.isFromCache,
  }) : documents = List.unmodifiable(documents);
  final List<RawDocument> documents;
  final PageCursor? nextCursor;
  final bool hasMore, isFromCache;
}

final class DocumentOrder {
  const DocumentOrder(this.field, {this.descending = false});
  final String field;
  final bool descending;
}

final class DocumentQuery {
  DocumentQuery(
    this.collection, {
    this.limit = 50,
    this.after,
    Map<String, Object?> equals = const {},
    List<DocumentOrder> order = const [],
  }) : equals = Map.unmodifiable(equals),
       order = List.unmodifiable(order) {
    if (limit < 1 || limit > 200 || !collections.contains(collection)) {
      throw ArgumentError('A bounded private query is required.');
    }
  }
  static const collections = {
    'obligations',
    'obligationInstances',
    'contacts',
    'payments',
    'paymentSources',
    'categories',
    'activities',
  };
  final String collection;
  final int limit;
  final PageCursor? after;
  final Map<String, Object?> equals;
  final List<DocumentOrder> order;
}

abstract interface class OwnerDocumentGateway {
  OwnerUid get owner;
  Stream<RawPage> watchPage(DocumentQuery query);
  Future<RawPage> getPage(DocumentQuery query);
  Stream<RawDocument?> watchDocument(String collection, String id);
}
