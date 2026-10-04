import '../../core/identifiers/entity_ids.dart';
import '../domain/catalog.dart';
import '../domain/catalog_repository.dart';
import '../domain/data_page.dart';
import 'catalog_dto.dart';
import 'document_reader.dart';
import 'financial_repository_base.dart';
import 'financial_failure_mapper.dart';
import 'owner_document_gateway.dart';

final class FirestoreCatalogRepository extends FinancialRepositoryBase
    implements CatalogRepository {
  FirestoreCatalogRepository(super.documents, super.commands);
  @override
  Stream<Contact?> watchContact(ContactId id) async* {
    try {
      await for (final doc in documents.watchDocument('contacts', id.value)) {
        yield doc == null ? null : _contact(doc);
      }
    } catch (error) {
      throw financialFailure(error);
    }
  }

  DocumentQuery _query(String collection, int limit, PageCursor? after) =>
      DocumentQuery(
        collection,
        limit: limit,
        after: after,
        order: [
          DocumentOrder(collection == 'contacts' ? 'searchName' : 'name'),
        ],
      );
  Contact _contact(RawDocument doc) =>
      CatalogDto.contact(doc.id, doc.data, owner);
  PaymentSource _source(RawDocument doc) =>
      CatalogDto.source(doc.id, doc.data, owner);
  Category _category(RawDocument doc) =>
      CatalogDto.category(doc.id, doc.data, owner);
  @override
  Stream<DataPage<Contact>> watchContacts({int limit = 50}) =>
      watch(_query('contacts', limit, null), _contact);
  @override
  Future<DataPage<Contact>> getContacts({int limit = 50, PageCursor? after}) =>
      get(_query('contacts', limit, after), _contact);
  @override
  Stream<DataPage<PaymentSource>> watchSources({int limit = 50}) =>
      watch(_query('paymentSources', limit, null), _source);
  @override
  Future<DataPage<PaymentSource>> getSources({
    int limit = 50,
    PageCursor? after,
  }) => get(_query('paymentSources', limit, after), _source);
  @override
  Stream<DataPage<Category>> watchCategories({int limit = 50}) =>
      watch(_query('categories', limit, null), _category);
  @override
  Future<DataPage<Category>> getCategories({
    int limit = 50,
    PageCursor? after,
  }) => get(_query('categories', limit, after), _category);
  Future<CatalogResult<T>> _save<T>(
    String kind,
    String? id,
    int? revision,
    Map<String, Object?> values,
    CommandId commandId,
    T Function(String) typedId,
  ) async {
    if ((id == null) != (revision == null)) {
      throw ArgumentError('Record revision required.');
    }
    final data = DocumentReader(
      await commands.call('saveCatalog', commandId, {
        'kind': kind,
        'id': id,
        'expectedRevision': revision,
        'values': values,
      }),
    );
    return CatalogResult(
      typedId(data.text('id', required: true)),
      data.integer('revision', min: 1),
    );
  }

  @override
  Future<CatalogResult<ContactId>> saveContact(
    ContactDraft draft,
    CommandId commandId, {
    ContactId? id,
    int? expectedRevision,
  }) => _save(
    'contact',
    id?.value,
    expectedRevision,
    draft.toPayload(),
    commandId,
    ContactId.new,
  );
  @override
  Future<CatalogResult<SourceId>> saveSource(
    SourceDraft draft,
    CommandId commandId, {
    SourceId? id,
    int? expectedRevision,
  }) => _save(
    'source',
    id?.value,
    expectedRevision,
    draft.toPayload(),
    commandId,
    SourceId.new,
  );
  @override
  Future<CatalogResult<CategoryId>> saveCategory(
    CategoryDraft draft,
    CommandId commandId, {
    CategoryId? id,
    int? expectedRevision,
  }) => _save(
    'category',
    id?.value,
    expectedRevision,
    draft.toPayload(),
    commandId,
    CategoryId.new,
  );
}
