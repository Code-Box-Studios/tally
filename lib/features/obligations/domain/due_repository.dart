import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/data_page.dart';
import 'due_query.dart';
import 'obligation_instance.dart';

abstract interface class DueRepository {
  OwnerUid get owner;
  Stream<DataPage<ObligationInstance>> watchDue(DueQuery query);
  Future<DataPage<ObligationInstance>> getDue(
    DueQuery query, {
    PageCursor? after,
  });
}
