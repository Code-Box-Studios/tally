import 'local_date.dart';
import '../errors/app_failure.dart';

final class YearMonth implements Comparable<YearMonth> {
  YearMonth._(this.year, this.month);
  factory YearMonth.parse(String value) {
    final match = _pattern.firstMatch(value);
    if (match == null || match.end != value.length) {
      throw AppFailure(
        AppFailureCode.invalidDate,
        messageKey: 'date.invalidMonth',
      );
    }
    return YearMonth.fromParts(int.parse(match[1]!), int.parse(match[2]!));
  }

  factory YearMonth.fromParts(int year, int month) {
    LocalDate.fromParts(year, month, 1);
    return YearMonth._(year, month);
  }

  static final _pattern = RegExp(r'^(\d{4})-(\d{2})$');
  final int year;
  final int month;
  LocalDate get firstDay => LocalDate.fromParts(year, month, 1);
  LocalDate get lastDay =>
      LocalDate.fromParts(year, month, DateTime.utc(year, month + 1, 0).day);

  @override
  int compareTo(YearMonth other) => toString().compareTo(other.toString());

  @override
  String toString() =>
      '${year.toString().padLeft(4, '0')}-${month.toString().padLeft(2, '0')}';

  @override
  bool operator ==(Object other) =>
      other is YearMonth && year == other.year && month == other.month;

  @override
  int get hashCode => Object.hash(year, month);
}
