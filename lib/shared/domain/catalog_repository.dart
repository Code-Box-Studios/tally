import '../../core/identifiers/entity_ids.dart';
import 'catalog.dart';
import 'data_page.dart';

abstract interface class CatalogRepository {
  OwnerUid get owner;
  Stream<DataRecord<Contact?>> watchContact(ContactId id);
  Stream<DataPage<Contact>> watchContacts({int limit = 50});
  Future<DataPage<Contact>> getContacts({int limit = 50, PageCursor? after});
  Stream<DataPage<PaymentSource>> watchSources({int limit = 50});
  Future<DataPage<PaymentSource>> getSources({
    int limit = 50,
    PageCursor? after,
  });
  Stream<DataPage<Category>> watchCategories({int limit = 50});
  Future<DataPage<Category>> getCategories({int limit = 50, PageCursor? after});
  Future<CatalogResult<ContactId>> saveContact(
    ContactDraft draft,
    CommandId commandId, {
    ContactId? id,
    int? expectedRevision,
  });
  Future<CatalogResult<SourceId>> saveSource(
    SourceDraft draft,
    CommandId commandId, {
    SourceId? id,
    int? expectedRevision,
  });
  Future<CatalogResult<CategoryId>> saveCategory(
    CategoryDraft draft,
    CommandId commandId, {
    CategoryId? id,
    int? expectedRevision,
  });
}
