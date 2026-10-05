import '../../../core/dates/local_date.dart';
import '../../../core/dates/timezone_catalog.dart';

enum RecurrenceFrequency {
  weekly,
  biweekly,
  monthly,
  quarterly,
  yearly,
  custom,
}

enum RecurrenceUnit { days, weeks, months, years }

final class RecurringOccurrence {
  const RecurringOccurrence(this.index, this.date);
  final int index;
  final LocalDate date;
}

final class RecurrenceBatch {
  RecurrenceBatch(List<RecurringOccurrence> occurrences, this.hasMore)
    : occurrences = List.unmodifiable(occurrences);
  final List<RecurringOccurrence> occurrences;
  final bool hasMore;
}

final class RecurrenceRule {
  const RecurrenceRule._({
    required this.frequency,
    required this.interval,
    required this.unit,
    required this.anchorDate,
    required this.preferredDay,
    required this.monthEnd,
    required this.timezone,
    required this.localDeductionTime,
    required this.startDate,
    required this.endDate,
    required this.ruleVersion,
  });

  factory RecurrenceRule({
    required RecurrenceFrequency frequency,
    required LocalDate anchorDate,
    required LocalDate startDate,
    LocalDate? endDate,
    int? preferredDay,
    bool monthEnd = false,
    required String timezone,
    String localDeductionTime = '09:00',
    RecurrenceUnit? unit,
    int? interval,
    int ruleVersion = 1,
  }) {
    final standard = _standard[frequency];
    final resolvedUnit = standard?.$1 ?? unit;
    if (resolvedUnit == null) throw ArgumentError('Choose a recurrence unit.');
    return RecurrenceRule.fromMap({
      'frequency': frequency.name,
      'unit': resolvedUnit.name,
      'interval': standard?.$2 ?? interval,
      'anchorDate': anchorDate.toString(),
      'startDate': startDate.toString(),
      'endDate': endDate?.toString(),
      'preferredDay':
          resolvedUnit == RecurrenceUnit.months ||
              resolvedUnit == RecurrenceUnit.years
          ? preferredDay ?? anchorDate.day
          : null,
      'monthEnd': monthEnd,
      'timezone': timezone,
      'localDeductionTime': localDeductionTime,
      'ruleVersion': ruleVersion,
    });
  }

  factory RecurrenceRule.fromMap(Map<String, Object?> raw) {
    if (raw.length != _fields.length || !_fields.every(raw.containsKey)) {
      throw ArgumentError('Invalid recurrence fields.');
    }
    T enumValue<T extends Enum>(String key, List<T> values) =>
        values.firstWhere(
          (value) => value.name == raw[key],
          orElse: () => throw ArgumentError('Invalid $key.'),
        );
    final frequency = enumValue('frequency', RecurrenceFrequency.values);
    final unit = enumValue('unit', RecurrenceUnit.values);
    final interval = raw['interval'];
    if (interval is! int || interval < 1 || interval > 365) {
      throw ArgumentError('Choose an interval from 1 to 365.');
    }
    final standard = _standard[frequency];
    if (standard != null && (standard.$1 != unit || standard.$2 != interval)) {
      throw ArgumentError('Frequency and interval do not match.');
    }
    final calendar =
        unit == RecurrenceUnit.months || unit == RecurrenceUnit.years;
    final preferredDay = raw['preferredDay'];
    if (calendar
        ? preferredDay is! int || preferredDay < 1 || preferredDay > 31
        : preferredDay != null) {
      throw ArgumentError('Choose a valid preferred day.');
    }
    final monthEnd = raw['monthEnd'];
    if (monthEnd is! bool || (monthEnd && !calendar)) {
      throw ArgumentError('Invalid month end.');
    }
    LocalDate date(String key) {
      final value = raw[key];
      if (value is! String) throw ArgumentError('Invalid date.');
      return LocalDate.parse(value);
    }

    final anchorDate = date('anchorDate'), startDate = date('startDate');
    final endDate = raw['endDate'] == null ? null : date('endDate');
    if (startDate.compareTo(anchorDate) < 0 ||
        (endDate != null && endDate.compareTo(startDate) < 0)) {
      throw ArgumentError('Check the start and end dates.');
    }
    final timezone = raw['timezone'],
        time = raw['localDeductionTime'],
        version = raw['ruleVersion'];
    if (timezone is! String ||
        timezone.length > 100 ||
        !TimezoneCatalog.contains(timezone)) {
      throw ArgumentError('Choose a valid timezone.');
    }
    if (time is! String || !_time.hasMatch(time) || time.length != 5) {
      throw ArgumentError('Enter a time from 00:00 to 23:59.');
    }
    if (version is! int || version < 1 || version >= 9007199254740991) {
      throw ArgumentError('Invalid rule version.');
    }
    return RecurrenceRule._(
      frequency: frequency,
      interval: interval,
      unit: unit,
      anchorDate: anchorDate,
      preferredDay: preferredDay as int?,
      monthEnd: monthEnd,
      timezone: timezone,
      localDeductionTime: time,
      startDate: startDate,
      endDate: endDate,
      ruleVersion: version,
    );
  }

  static const _fields = {
    'frequency',
    'interval',
    'unit',
    'anchorDate',
    'preferredDay',
    'monthEnd',
    'timezone',
    'localDeductionTime',
    'startDate',
    'endDate',
    'ruleVersion',
  };
  static const _standard = {
    RecurrenceFrequency.weekly: (RecurrenceUnit.weeks, 1),
    RecurrenceFrequency.biweekly: (RecurrenceUnit.weeks, 2),
    RecurrenceFrequency.monthly: (RecurrenceUnit.months, 1),
    RecurrenceFrequency.quarterly: (RecurrenceUnit.months, 3),
    RecurrenceFrequency.yearly: (RecurrenceUnit.years, 1),
  };
  static final _time = RegExp(r'^(?:[01]\d|2[0-3]):[0-5]\d$');
  final RecurrenceFrequency frequency;
  final RecurrenceUnit unit;
  final int interval, ruleVersion;
  final LocalDate anchorDate, startDate;
  final LocalDate? endDate;
  final int? preferredDay;
  final bool monthEnd;
  final String timezone, localDeductionTime;
  int get _monthStep => interval * (unit == RecurrenceUnit.years ? 12 : 1);
  int get _dayStep => interval * (unit == RecurrenceUnit.weeks ? 7 : 1);
  DateTime _utc(LocalDate date) =>
      DateTime.utc(date.year, date.month, date.day);

  Map<String, Object?> toMap() => {
    'frequency': frequency.name,
    'interval': interval,
    'unit': unit.name,
    'anchorDate': anchorDate.toString(),
    'preferredDay': preferredDay,
    'monthEnd': monthEnd,
    'timezone': timezone,
    'localDeductionTime': localDeductionTime,
    'startDate': startDate.toString(),
    'endDate': endDate?.toString(),
    'ruleVersion': ruleVersion,
  };

  LocalDate? occurrenceAt(int index) {
    if (index < 0 || index > 110000) {
      throw ArgumentError('Invalid recurrence cursor.');
    }
    if (unit == RecurrenceUnit.days || unit == RecurrenceUnit.weeks) {
      final days = index * _dayStep;
      if (days >
          DateTime.utc(2199, 12, 31).difference(_utc(anchorDate)).inDays) {
        return null;
      }
      return anchorDate.addDays(days);
    }
    final absolute =
        anchorDate.year * 12 + anchorDate.month - 1 + index * _monthStep;
    final year = absolute ~/ 12, month = absolute % 12 + 1;
    if (year > 2199) return null;
    final last = DateTime.utc(year, month + 1, 0).day;
    return LocalDate.fromParts(
      year,
      month,
      monthEnd ? last : preferredDay!.clamp(1, last),
    );
  }

  RecurringOccurrence? nextOccurrence(LocalDate? afterExclusive) {
    final threshold =
        afterExclusive != null && afterExclusive.compareTo(startDate) >= 0
        ? afterExclusive
        : startDate;
    var index = unit == RecurrenceUnit.days || unit == RecurrenceUnit.weeks
        ? _utc(threshold).difference(_utc(anchorDate)).inDays ~/ _dayStep
        : ((threshold.year - anchorDate.year) * 12 +
                  threshold.month -
                  anchorDate.month) ~/
              _monthStep;
    if (index < 0) index = 0;
    for (var attempt = 0; attempt < 3; attempt++, index++) {
      final date = occurrenceAt(index);
      if (date == null || (endDate != null && date.compareTo(endDate!) > 0)) {
        return null;
      }
      if (date.compareTo(startDate) >= 0 &&
          (afterExclusive == null || date.compareTo(afterExclusive) > 0)) {
        return RecurringOccurrence(index, date);
      }
    }
    throw ArgumentError('Invalid recurrence lower bound.');
  }

  RecurrenceBatch occurrencesThrough({
    required LocalDate? afterExclusive,
    required LocalDate through,
    int limit = 30,
  }) {
    if (limit < 1 || limit > 30) {
      throw ArgumentError('Invalid generation limit.');
    }
    final occurrences = <RecurringOccurrence>[];
    var next = nextOccurrence(afterExclusive);
    while (next != null &&
        next.date.compareTo(through) <= 0 &&
        occurrences.length < limit) {
      occurrences.add(next);
      next = nextOccurrence(next.date);
    }
    return RecurrenceBatch(
      occurrences,
      next != null && next.date.compareTo(through) <= 0,
    );
  }
}
