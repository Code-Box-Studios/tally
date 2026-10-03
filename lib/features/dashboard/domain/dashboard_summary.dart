import '../../../core/dates/local_date.dart';
import '../../../core/dates/year_month.dart';
import '../../../core/errors/app_failure.dart';
import '../../../core/money/currency_code.dart';
import '../../../core/money/money.dart';

enum PreviewSection { owedByMe, owedToMe, recurringDue }

enum PreviewDueState { upcoming, dueToday, overdue, paid, expected, failed }

final class DashboardQuery {
  const DashboardQuery({required this.currency, required this.month});
  final CurrencyCode currency;
  final YearMonth month;
  @override
  bool operator ==(Object other) =>
      other is DashboardQuery &&
      other.currency == currency &&
      other.month == month;
  @override
  int get hashCode => Object.hash(currency, month);
}

final class DuePreviewItem {
  const DuePreviewItem({
    required this.title,
    required this.dueDate,
    required this.remaining,
    required this.section,
    required this.state,
    this.automatic = false,
    this.assumed = false,
  });
  final String title;
  final LocalDate dueDate;
  final Money? remaining;
  final PreviewSection section;
  final PreviewDueState state;
  final bool automatic;
  final bool assumed;
}

final class DashboardSummary {
  DashboardSummary({
    required this.currency,
    required this.month,
    required this.asOfDate,
    required this.youOwe,
    required this.owedToYou,
    required this.dueThisMonth,
    required this.paidThisMonth,
    required this.remainingThisMonth,
    required this.overdue,
    required List<DuePreviewItem> upcoming,
  }) : upcoming = List.unmodifiable(upcoming) {
    for (final value in [
      youOwe,
      owedToYou,
      dueThisMonth,
      paidThisMonth,
      remainingThisMonth,
      overdue,
      ...upcoming.map((item) => item.remaining).whereType<Money>(),
    ]) {
      if (value.currency != currency) {
        throw AppFailure(
          AppFailureCode.currencyMismatch,
          messageKey: 'money.currencyMismatch',
        );
      }
      if (value.minorUnits < 0) {
        throw AppFailure(
          AppFailureCode.invalidAmount,
          messageKey: 'money.nonnegativeRequired',
        );
      }
    }
  }
  final CurrencyCode currency;
  final YearMonth month;
  final LocalDate asOfDate;
  final Money youOwe,
      owedToYou,
      dueThisMonth,
      paidThisMonth,
      remainingThisMonth,
      overdue;
  final List<DuePreviewItem> upcoming;
  Money get netPosition => owedToYou.subtract(youOwe);
}
