import '../../../core/dates/local_date.dart';
import '../../../core/dates/year_month.dart';
import '../../obligations/domain/obligation_instance.dart';
import 'financial_filter.dart';
import 'period_query.dart';

final class CalendarQuery {
  CalendarQuery({
    required this.month,
    required DateTime now,
    FinancialFilter? filter,
  }) : now = now.toUtc(),
       filter = filter ?? FinancialFilter();
  final YearMonth month;
  final DateTime now;
  final FinancialFilter filter;
  LocalDate get _first =>
      filter.firstDate != null &&
          filter.firstDate!.compareTo(month.firstDay) > 0
      ? filter.firstDate!
      : month.firstDay;
  LocalDate get _last =>
      filter.lastDate != null && filter.lastDate!.compareTo(month.lastDay) < 0
      ? filter.lastDate!
      : month.lastDay;
  bool get isEmpty => _first.compareTo(_last) > 0;
  LocalDate? get firstDate => isEmpty ? null : _first;
  LocalDate? get lastDate => isEmpty ? null : _last;
  PeriodQuery get periods => PeriodQuery(
    now: now,
    filter: isEmpty ? filter : filter.withDates(_first, _last),
    empty: isEmpty,
  );
  bool matches(ObligationInstance instance) => periods.matches(instance);
  YearMonth? get previousMonth => month.year == 1900 && month.month == 1
      ? null
      : YearMonth.fromParts(
          month.month == 1 ? month.year - 1 : month.year,
          month.month == 1 ? 12 : month.month - 1,
        );
  YearMonth? get nextMonth => month.year == 2199 && month.month == 12
      ? null
      : YearMonth.fromParts(
          month.month == 12 ? month.year + 1 : month.year,
          month.month == 12 ? 1 : month.month + 1,
        );
  @override
  bool operator ==(Object other) =>
      other is CalendarQuery &&
      other.month == month &&
      other.filter == filter &&
      other.periods == periods;
  @override
  int get hashCode => Object.hash(month, filter, periods);
}
