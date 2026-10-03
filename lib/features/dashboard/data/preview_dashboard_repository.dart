import '../../../core/dates/local_date.dart';
import '../../../core/money/currency_code.dart';
import '../../../core/money/money.dart';
import '../domain/dashboard_repository.dart';
import '../domain/dashboard_summary.dart';
import 'empty_dashboard_repository.dart';

class PreviewDashboardRepository implements DashboardRepository {
  @override
  Stream<DashboardSummary> watchSummary(DashboardQuery query) {
    if (query.month.toString() != '2026-10' ||
        ![CurrencyCode.php, CurrencyCode.usd].contains(query.currency)) {
      return EmptyDashboardRepository().watchSummary(query);
    }
    final php = query.currency == CurrencyCode.php;
    Money money(int minor) => Money.fromMinorUnits(minor, query.currency);
    DuePreviewItem item(
      String title,
      String date,
      int? minor,
      PreviewSection section,
      PreviewDueState state, {
      bool auto = false,
      bool assumed = false,
    }) => DuePreviewItem(
      title: title,
      dueDate: LocalDate.parse(date),
      remaining: minor == null ? null : money(minor),
      section: section,
      state: state,
      automatic: auto,
      assumed: assumed,
    );
    return Stream.value(
      DashboardSummary(
        currency: query.currency,
        month: query.month,
        asOfDate: LocalDate.parse('2026-10-03'),
        youOwe: money(php ? 2500000 : 0),
        owedToYou: money(php ? 1250000 : 50000),
        dueThisMonth: money(php ? 1999800 : 0),
        paidThisMonth: money(php ? 190000 : 0),
        remainingThisMonth: money(php ? 1809800 : 0),
        overdue: money(php ? 160000 : 0),
        upcoming: php
            ? [
                item(
                  'Family loan',
                  '2026-10-01',
                  160000,
                  PreviewSection.owedByMe,
                  PreviewDueState.overdue,
                ),
                item(
                  'Rent',
                  '2026-10-03',
                  800000,
                  PreviewSection.recurringDue,
                  PreviewDueState.dueToday,
                ),
                item(
                  'John’s repayment',
                  '2026-10-05',
                  250000,
                  PreviewSection.owedToMe,
                  PreviewDueState.upcoming,
                ),
                item(
                  'Internet',
                  '2026-10-07',
                  169900,
                  PreviewSection.recurringDue,
                  PreviewDueState.upcoming,
                ),
                item(
                  'Car loan',
                  '2026-10-20',
                  400000,
                  PreviewSection.owedByMe,
                  PreviewDueState.upcoming,
                ),
                item(
                  'Association dues',
                  '2026-10-25',
                  225000,
                  PreviewSection.recurringDue,
                  PreviewDueState.upcoming,
                ),
                item(
                  'Netflix',
                  '2026-10-18',
                  54900,
                  PreviewSection.recurringDue,
                  PreviewDueState.expected,
                  auto: true,
                ),
                item(
                  'Spotify',
                  '2026-10-01',
                  0,
                  PreviewSection.recurringDue,
                  PreviewDueState.paid,
                  auto: true,
                  assumed: true,
                ),
                item(
                  'Electricity',
                  '2026-10-15',
                  null,
                  PreviewSection.recurringDue,
                  PreviewDueState.upcoming,
                ),
              ]
            : [
                item(
                  'Alex’s repayment',
                  '2026-10-12',
                  50000,
                  PreviewSection.owedToMe,
                  PreviewDueState.upcoming,
                ),
              ],
      ),
    );
  }
}
