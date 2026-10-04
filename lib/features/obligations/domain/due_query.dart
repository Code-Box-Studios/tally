import '../../../core/dates/local_date.dart';
import '../../../core/dates/timezone_catalog.dart';
import '../../../core/money/currency_code.dart';
import 'obligation.dart';
import 'obligation_instance.dart';

enum DueGroup { today, soon, overdue, upcoming }

final class DueEnvelope {
  const DueEnvelope(this.first, this.last);
  final LocalDate? first;
  final LocalDate last;
}

final class DueQuery {
  DueQuery({
    required this.group,
    required DateTime now,
    this.currency,
    this.section,
    this.automaticOnly = false,
    this.direction,
  }) : now = now.toUtc();
  final DueGroup group;
  final DateTime now;
  final CurrencyCode? currency;
  final ObligationSection? section;
  final bool automaticOnly;
  final ObligationDirection? direction;

  LocalDate _boundedDate(DateTime date) {
    if (date.year < 1900) return LocalDate.parse('1900-01-01');
    if (date.year > 2199) return LocalDate.parse('2199-12-31');
    return LocalDate.fromParts(date.year, date.month, date.day);
  }

  DueEnvelope get envelope {
    final utcDay = DateTime.utc(now.year, now.month, now.day);
    LocalDate shift(int days) => _boundedDate(utcDay.add(Duration(days: days)));
    // A saved zone can be a civil day before or after the UTC day.
    return switch (group) {
      DueGroup.today => DueEnvelope(shift(-1), shift(1)),
      DueGroup.soon => DueEnvelope(shift(0), shift(8)),
      DueGroup.overdue => DueEnvelope(null, shift(0)),
      DueGroup.upcoming => DueEnvelope(shift(-1), shift(31)),
    };
  }

  bool matches(ObligationInstance instance) {
    final due = instance.dueDate;
    if (due == null ||
        instance.closed ||
        instance.status == FinancialStatus.cancelled ||
        instance.status == FinancialStatus.skipped ||
        instance.status == FinancialStatus.paid ||
        instance.remainingAmount?.minorUnits == 0 ||
        (currency != null && instance.currency != currency) ||
        (section != null && instance.section != section) ||
        (direction != null && instance.direction != direction) ||
        (automaticOnly && instance.paymentMode == PaymentMode.manual)) {
      return false;
    }
    final local = TimezoneCatalog.at(now, instance.timezone);
    final today = DateTime.utc(local.year, local.month, local.day);
    final dueDay = DateTime.utc(due.year, due.month, due.day);
    final days = dueDay.difference(today).inDays;
    return switch (group) {
      DueGroup.today => days == 0,
      DueGroup.soon => days > 0 && days <= 7,
      DueGroup.overdue => days < 0,
      DueGroup.upcoming => days >= 0 && days <= 30,
    };
  }

  @override
  bool operator ==(Object other) =>
      other is DueQuery &&
      other.group == group &&
      other.now == now &&
      other.currency == currency &&
      other.section == section &&
      other.direction == direction &&
      other.automaticOnly == automaticOnly;
  @override
  int get hashCode =>
      Object.hash(group, now, currency, section, automaticOnly, direction);
}
