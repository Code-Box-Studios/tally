import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/data_page.dart';
import 'activity_entry.dart';

abstract interface class ActivityRepository {
  OwnerUid get owner;
  Stream<DataPage<ActivityEntry>> watchActivity();
  Future<DataPage<ActivityEntry>> getActivity({PageCursor? after});
}
