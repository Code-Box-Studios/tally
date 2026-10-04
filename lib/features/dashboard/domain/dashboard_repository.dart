import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../../../shared/domain/data_page.dart';
import 'dashboard_summary.dart';

abstract interface class DashboardRepository {
  Stream<DashboardSummary> watchSummary(DashboardQuery query);
}

abstract interface class ProjectedDashboardRepository {
  OwnerUid get owner;
  Stream<DataRecord<ProjectedDashboardSummary?>> watchSummary(
    CurrencyCode currency,
  );
  Stream<DataRecord<LedgerState?>> watchLedger();
  Stream<DataRecord<ProjectedContactSummary?>> watchContact(ContactId id);
  Future<void> refresh(CommandId commandId);
}
