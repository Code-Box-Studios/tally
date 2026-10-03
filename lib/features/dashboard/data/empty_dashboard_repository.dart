import '../../../core/money/money.dart';
import '../domain/dashboard_repository.dart';
import '../domain/dashboard_summary.dart';

class EmptyDashboardRepository implements DashboardRepository {
  @override
  Stream<DashboardSummary> watchSummary(DashboardQuery query) {
    final zero = Money.fromMinorUnits(0, query.currency);
    return Stream.value(
      DashboardSummary(
        currency: query.currency,
        month: query.month,
        asOfDate: query.month.firstDay,
        youOwe: zero,
        owedToYou: zero,
        dueThisMonth: zero,
        paidThisMonth: zero,
        remainingThisMonth: zero,
        overdue: zero,
        upcoming: [],
      ),
    );
  }
}
