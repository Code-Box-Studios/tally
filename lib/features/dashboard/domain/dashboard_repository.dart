import 'dashboard_summary.dart';

abstract interface class DashboardRepository {
  Stream<DashboardSummary> watchSummary(DashboardQuery query);
}
