import 'package:test/test.dart';
import 'package:tally/core/dates/local_date.dart';
import 'package:tally/core/dates/year_month.dart';
import 'package:tally/core/errors/app_failure.dart';

final invalidDate = isA<AppFailure>().having(
  (e) => e.code,
  'code',
  AppFailureCode.invalidDate,
);

void main() {
  test('civil dates round trip without an implicit instant or timezone', () {
    final date = LocalDate.parse('2026-10-05');
    expect(date.toString(), '2026-10-05');
    expect(date.yearMonth.toString(), '2026-10');
    expect(date, LocalDate.fromParts(2026, 10, 5));
  });
  test('Gregorian leap days include the century rule', () {
    expect(LocalDate.parse('2024-02-29').day, 29);
    expect(LocalDate.parse('2000-02-29').day, 29);
    expect(() => LocalDate.parse('1900-02-29'), throwsA(invalidDate));
  });
  for (final value in [
    '2026-02-29',
    '2026-02-30',
    '2026-2-05',
    '1899-12-31',
    '2200-01-01',
    '2026-13-01',
    '2026-00-05',
    '2026-10-00',
    '2026-10-32',
    '2026-10-05Z',
    '2026-10-05\n',
    ' 2026-10-05',
  ]) {
    test('rejects noncanonical or invalid date "$value"', () {
      expect(() => LocalDate.parse(value), throwsA(invalidDate));
    });
  }
  test('day arithmetic preserves month and year boundaries', () {
    expect(LocalDate.parse('2026-12-31').addDays(1).toString(), '2027-01-01');
    expect(LocalDate.parse('2024-02-28').addDays(1).toString(), '2024-02-29');
    expect(LocalDate.parse('2026-03-01').addDays(-1).toString(), '2026-02-28');
  });
  test('day arithmetic cannot leave the supported range', () {
    expect(
      () => LocalDate.parse('1900-01-01').addDays(-1),
      throwsA(invalidDate),
    );
    expect(
      () => LocalDate.parse('2199-12-31').addDays(1),
      throwsA(invalidDate),
    );
    expect(
      () => LocalDate.parse('2026-10-05').addDays(1000000000),
      throwsA(invalidDate),
    );
  });
  test('year months produce exact first and last civil days', () {
    expect(YearMonth.parse('2024-02').firstDay.toString(), '2024-02-01');
    expect(YearMonth.parse('2024-02').lastDay.toString(), '2024-02-29');
    expect(YearMonth.parse('2026-02').lastDay.toString(), '2026-02-28');
    expect(YearMonth.parse('2199-12').lastDay.toString(), '2199-12-31');
    expect(() => YearMonth.parse('2026-2'), throwsA(invalidDate));
    expect(() => YearMonth.parse('2026-13'), throwsA(invalidDate));
  });
  test('dates and months sort chronologically with value equality', () {
    final dates = [LocalDate.parse('2027-01-01'), LocalDate.parse('2026-12-31')]
      ..sort();
    expect(dates.map((e) => e.toString()).toList(), [
      '2026-12-31',
      '2027-01-01',
    ]);
    expect(
      YearMonth.parse('2026-09').compareTo(YearMonth.parse('2026-10')),
      lessThan(0),
    );
    expect(
      {YearMonth.parse('2026-10'), YearMonth.fromParts(2026, 10)}.length,
      1,
    );
  });
}
