import 'year_month.dart';
import '../errors/app_failure.dart';

final class LocalDate implements Comparable<LocalDate> {
  LocalDate._(this.year, this.month, this.day);
  factory LocalDate.parse(String value) {
    final match = _pattern.firstMatch(value);
    if (match == null || match.end != value.length) throw _invalid();
    return LocalDate.fromParts(
      int.parse(match[1]!),
      int.parse(match[2]!),
      int.parse(match[3]!),
    );
  }

  factory LocalDate.fromParts(int year, int month, int day) {
    if (year < 1900 ||
        year > 2199 ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31) {
      throw _invalid();
    }
    final actual = DateTime.utc(year, month, day);
    if (actual.year != year || actual.month != month || actual.day != day) {
      throw _invalid();
    }
    return LocalDate._(year, month, day);
  }

  static final _pattern = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');
  static AppFailure _invalid() =>
      AppFailure(AppFailureCode.invalidDate, messageKey: 'date.invalidDate');
  final int year;
  final int month;
  final int day;
  YearMonth get yearMonth => YearMonth.fromParts(year, month);

  LocalDate addDays(int days) {
    // Every supported date is within this bounded span; reject huge durations
    // before Duration/DateTime could overflow on any platform.
    if (days < -110000 || days > 110000) throw _invalid();
    final next = DateTime.utc(year, month, day).add(Duration(days: days));
    return LocalDate.fromParts(next.year, next.month, next.day);
  }

  @override
  String toString() =>
      '${year.toString().padLeft(4, '0')}-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';

  @override
  int compareTo(LocalDate other) => toString().compareTo(other.toString());

  @override
  bool operator ==(Object other) =>
      other is LocalDate &&
      year == other.year &&
      month == other.month &&
      day == other.day;

  @override
  int get hashCode => Object.hash(year, month, day);
}
