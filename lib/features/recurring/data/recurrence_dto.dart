import '../../../shared/data/document_reader.dart';
import '../../../core/dates/local_date.dart';
import '../domain/recurrence_rule.dart';
import '../domain/recurring_schedule.dart';

abstract final class RecurrenceDto {
  static RecurringSchedule fromMap(Map<String, Object?> data) {
    try {
      final d = DocumentReader(data),
          raw = Map<String, Object?>.from(data)
            ..remove('generationCursor')
            ..remove('generatedThrough')
            ..remove('pauseRanges')
            ..remove('endedOn');
      final rule = RecurrenceRule.fromMap(raw), ranges = <PauseRange>[];
      LocalDate? previousEnd;
      for (final value in d.objects('pauseRanges', max: 120)) {
        if (value.data.length != 2) throw DocumentReader.invalid();
        final start = value.date('startDate'),
            end = value.nullableDate('endDate');
        if (end != null && end.compareTo(start) <= 0 ||
            ranges.isNotEmpty &&
                (previousEnd == null || start.compareTo(previousEnd) < 0)) {
          throw DocumentReader.invalid();
        }
        ranges.add(PauseRange(start, end));
        previousEnd = end;
      }
      return RecurringSchedule(
        rule: rule,
        generationCursor: d.integer('generationCursor', min: -1, max: 110000),
        generatedThrough: d.nullableDate('generatedThrough'),
        pauseRanges: ranges,
        endedOn: d.nullableDate('endedOn'),
      );
    } catch (_) {
      throw DocumentReader.invalid();
    }
  }

  static ReminderPolicy reminder(DocumentReader d) {
    try {
      final raw = d.value('offsetDays');
      if (raw is! List || raw.any((v) => v is! int)) {
        throw DocumentReader.invalid();
      }
      return ReminderPolicy(
        enabled: d.boolean('enabled'),
        offsetDays: raw.cast<int>(),
        localTime: d.text('localTime', max: 5),
        preferenceRevision: d.data.containsKey('preferenceRevision')
            ? d.integer('preferenceRevision', min: 1)
            : null,
      );
    } catch (_) {
      throw DocumentReader.invalid();
    }
  }
}
