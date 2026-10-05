import '../../../core/dates/timezone_catalog.dart';
import '../../obligations/domain/obligation_instance.dart';
import 'financial_filter.dart';

final class PeriodQuery {
  PeriodQuery({
    required DateTime now,
    FinancialFilter? filter,
    this.empty = false,
  }) : now = now.toUtc(),
       filter = filter ?? FinancialFilter();
  final DateTime now;
  final FinancialFilter filter;
  final bool empty;

  static DateTime? _lastInstant;
  static String? _lastContext;
  static String civilContext(DateTime now) {
    final utc = now.toUtc();
    if (_lastInstant == utc) return _lastContext!;
    final value = TimezoneCatalog.names
        .map((zone) {
          final local = TimezoneCatalog.at(utc, zone);
          return '${local.year}-${local.month}-${local.day}';
        })
        .join('|');
    _lastInstant = utc;
    _lastContext = value;
    return value;
  }

  late final civilDayContext = civilContext(now);
  bool matches(ObligationInstance instance) =>
      !empty && filter.matchesInstance(instance, now);
  @override
  bool operator ==(Object other) =>
      other is PeriodQuery &&
      other.filter == filter &&
      other.empty == empty &&
      other.civilDayContext == civilDayContext;
  @override
  int get hashCode => Object.hash(filter, empty, civilDayContext);
}
