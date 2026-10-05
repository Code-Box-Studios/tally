import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/dates/local_date.dart';
import 'package:tally/core/dates/year_month.dart';
import 'package:tally/features/search/domain/calendar_query.dart';
import 'package:tally/features/search/domain/period_query.dart';
import 'package:tally/features/search/domain/financial_filter.dart';

import '../../support/filter_fixtures.dart';

void main() {
  final now = DateTime.utc(2026, 10, 5, 4);
  test('October calendar uses inclusive stored civil month boundaries', () {
    final query = CalendarQuery(month: YearMonth.parse('2026-10'), now: now);
    expect(query.firstDate.toString(), '2026-10-01');
    expect(query.lastDate.toString(), '2026-10-31');
    expect(
      query.matches(
        filterPeriod(
          patch: {'dueDate': '2026-10-01', 'timezone': 'America/Los_Angeles'},
        ),
      ),
      isTrue,
    );
    expect(
      query.matches(filterPeriod(patch: {'dueDate': '2026-11-01'})),
      isFalse,
    );
    expect(query.periods.matches(filterPeriod()), isTrue);
  });
  test('leap February and year navigation use calendar arithmetic', () {
    final query = CalendarQuery(month: YearMonth.parse('2028-02'), now: now);
    expect(query.lastDate.toString(), '2028-02-29');
    expect(query.previousMonth.toString(), '2028-01');
    expect(query.nextMonth.toString(), '2028-03');
    final december = CalendarQuery(month: YearMonth.parse('2026-12'), now: now);
    expect(december.nextMonth.toString(), '2027-01');
  });
  test('calendar month navigation stops at both supported date boundaries', () {
    expect(
      CalendarQuery(month: YearMonth.parse('1900-01'), now: now).previousMonth,
      isNull,
    );
    expect(
      CalendarQuery(month: YearMonth.parse('2199-12'), now: now).nextMonth,
      isNull,
    );
  });
  test('explicit date bounds intersect the selected month', () {
    final query = CalendarQuery(
      month: YearMonth.parse('2026-10'),
      now: now,
      filter: FinancialFilter(
        firstDate: LocalDate.parse('2026-10-10'),
        lastDate: LocalDate.parse('2026-11-05'),
      ),
    );
    expect(query.firstDate.toString(), '2026-10-10');
    expect(query.lastDate.toString(), '2026-10-31');
    expect(query.matches(filterPeriod()), isFalse);
    expect(query.periods.filter.lastDate.toString(), '2026-10-31');
  });
  test('a disjoint month range is explicitly empty and matches no period', () {
    final query = CalendarQuery(
      month: YearMonth.parse('2026-10'),
      now: now,
      filter: FinancialFilter(firstDate: LocalDate.parse('2026-11-01')),
    );
    expect(query.isEmpty, isTrue);
    expect(query.periods.empty, isTrue);
    expect(query.matches(filterPeriod()), isFalse);
  });
  test('general period search is not restricted to a calendar month', () {
    final query = PeriodQuery(
      now: now,
      filter: FinancialFilter(
        firstDate: LocalDate.parse('2026-10-01'),
        lastDate: LocalDate.parse('2026-12-31'),
      ),
    );
    expect(
      query.matches(filterPeriod(patch: {'dueDate': '2026-12-15'})),
      isTrue,
    );
  });
  test(
    'pagination keys remain stable until a supported saved zone changes day',
    () {
      final filter = FinancialFilter(status: RecordStatus.overdue);
      final first = PeriodQuery(
            now: DateTime.utc(2026, 10, 5, 7, 40),
            filter: filter,
          ),
          sameDay = PeriodQuery(
            now: DateTime.utc(2026, 10, 5, 7, 41),
            filter: filter,
          ),
          laMidnight = PeriodQuery(
            now: DateTime.utc(2026, 10, 5, 8, 0),
            filter: filter,
          );
      expect(first, sameDay);
      expect(first.hashCode, sameDay.hashCode);
      expect(first, isNot(laMidnight));
      expect(
        first,
        isNot(
          PeriodQuery(
            now: first.now,
            filter: FinancialFilter(status: RecordStatus.paid),
          ),
        ),
      );
    },
  );
}
