import '../../../core/dates/local_date.dart';
import 'recurrence_rule.dart';

final class ReminderPolicy {
  ReminderPolicy({
    required this.enabled,
    required List<int> offsetDays,
    required this.localTime,
    this.preferenceRevision,
  }) : offsetDays = List.unmodifiable(offsetDays) {
    if (offsetDays.length > 8 ||
        offsetDays.toSet().length != offsetDays.length ||
        offsetDays.any((day) => day < 0 || day > 365) ||
        !RegExp(r'^(?:[01]\d|2[0-3]):[0-5]\d$').hasMatch(localTime) ||
        localTime.length != 5) {
      throw ArgumentError('Choose valid reminder days and time.');
    }
  }
  final bool enabled;
  final List<int> offsetDays;
  final String localTime;
  final int? preferenceRevision;
  Map<String, Object?> toPayload() => {
    'enabled': enabled,
    'offsetDays': offsetDays,
    'localTime': localTime,
  };
}

final class PauseRange {
  const PauseRange(this.startDate, this.endDate);
  final LocalDate startDate;
  final LocalDate? endDate;
}

final class RecurringSchedule {
  RecurringSchedule({
    required this.rule,
    required this.generationCursor,
    required this.generatedThrough,
    required List<PauseRange> pauseRanges,
    required this.endedOn,
  }) : pauseRanges = List.unmodifiable(pauseRanges);
  final RecurrenceRule rule;
  final int generationCursor;
  final LocalDate? generatedThrough, endedOn;
  final List<PauseRange> pauseRanges;
}
