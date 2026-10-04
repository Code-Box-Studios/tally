import '../../../shared/data/financial_repository_base.dart';
import '../../../shared/data/owner_document_gateway.dart';
import '../../../shared/domain/data_page.dart';
import '../domain/activity_entry.dart';
import '../domain/activity_repository.dart';
import 'activity_dto.dart';

final class FirestoreActivityRepository extends FinancialRepositoryBase
    implements ActivityRepository {
  FirestoreActivityRepository(super.documents, super.commands);
  DocumentQuery _query(PageCursor? after) => DocumentQuery(
    'activities',
    after: after,
    order: const [DocumentOrder('createdAt', descending: true)],
  );
  ActivityEntry _map(RawDocument doc) =>
      ActivityDto.fromMap(doc.id, doc.data, owner);
  @override
  Stream<DataPage<ActivityEntry>> watchActivity() => watch(_query(null), _map);
  @override
  Future<DataPage<ActivityEntry>> getActivity({PageCursor? after}) =>
      get(_query(after), _map);
}
