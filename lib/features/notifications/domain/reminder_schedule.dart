import '../../../core/dates/local_date.dart';
import '../../../core/dates/scheduled_time.dart';
import '../../../core/dates/timezone_catalog.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../obligations/domain/obligation.dart';
import '../../recurring/domain/recurring_schedule.dart';
import 'notification_preferences.dart';
import 'reminder_entry.dart';

final class ReminderSubject {
  const ReminderSubject({
    required this.instanceId,
    required this.obligationId,
    required this.section,
    required this.dueDate,
    required this.timezone,
    required this.paymentMode,
    required this.closed,
    required this.remainingMinor,
    required this.requiresDeductionConfirmation,
    required this.reminderPolicy,
    this.confirmationAt,
  });
  final InstanceId instanceId;
  final ObligationId obligationId;
  final ObligationSection section;
  final LocalDate? dueDate;
  final String timezone;
  final PaymentMode paymentMode;
  final bool closed, requiresDeductionConfirmation;
  final int? remainingMinor;
  final ReminderPolicy? reminderPolicy;
  final DateTime? confirmationAt;
}

final class PlannedReminder {
  const PlannedReminder({
    required this.kind,
    required this.phase,
    required this.civilTargetDate,
    required this.scheduledAt,
  });
  final ReminderKind kind;
  final ReminderPhase phase;
  final LocalDate civilTargetDate;
  final DateTime scheduledAt;
}

abstract final class ReminderSchedule {
  static DateTime afterQuietHours(
    DateTime instant,
    String profileTimezone,
    String start,
    String end,
  ) {
    if (!TimezoneCatalog.contains(profileTimezone) ||
        !NotificationPreferences.validTime(start) ||
        !NotificationPreferences.validTime(end)) {
      throw ArgumentError('Choose valid quiet hours and timezone.');
    }
    if (start == end) return instant.toUtc();
    final local = TimezoneCatalog.at(instant, profileTimezone);
    final time =
        '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
    final overnight = start.compareTo(end) > 0;
    final quiet = overnight
        ? time.compareTo(start) >= 0 || time.compareTo(end) < 0
        : time.compareTo(start) >= 0 && time.compareTo(end) < 0;
    if (!quiet) return instant.toUtc();
    final date = LocalDate.fromParts(
      local.year,
      local.month,
      local.day,
    ).addDays(overnight && time.compareTo(start) >= 0 ? 1 : 0);
    final parts = end.split(':').map(int.parse).toList();
    final wall = DateTime.utc(
      date.year,
      date.month,
      date.day,
      parts[0],
      parts[1],
    ).millisecondsSinceEpoch;
    final location = local.location;
    final endings =
        location.zones
            .map((zone) => wall - zone.offset.inMilliseconds)
            .where(
              (candidate) =>
                  candidate >= instant.millisecondsSinceEpoch &&
                  location.translate(candidate) == wall,
            )
            .toList()
          ..sort();
    return endings.isNotEmpty
        ? DateTime.fromMillisecondsSinceEpoch(endings.first, isUtc: true)
        : ScheduledTime.resolve(date, end, profileTimezone);
  }

  static int _day(LocalDate date) =>
      DateTime.utc(date.year, date.month, date.day).millisecondsSinceEpoch ~/
      86400000;
  static LocalDate? _date(int day) {
    final value = DateTime.fromMillisecondsSinceEpoch(
      day * 86400000,
      isUtc: true,
    );
    return value.year < 1900 || value.year > 2199
        ? null
        : LocalDate.fromParts(value.year, value.month, value.day);
  }

  static List<PlannedReminder> plan(
    ReminderSubject subject,
    NotificationPreferences preferences,
    String profileTimezone,
    DateTime now,
  ) {
    if (!TimezoneCatalog.contains(subject.timezone) ||
        !TimezoneCatalog.contains(profileTimezone)) {
      throw ArgumentError('Choose a valid timezone.');
    }
    final remaining = subject.remainingMinor;
    if (remaining != null && (remaining < 0 || remaining > 1000000000000)) {
      throw ArgumentError('Invalid reminder amount.');
    }
    final dueDate = subject.dueDate, policy = subject.reminderPolicy;
    if (!preferences.enabled ||
        subject.closed ||
        remaining == 0 ||
        dueDate == null ||
        policy?.enabled == false) {
      return [];
    }
    final local = TimezoneCatalog.at(now, subject.timezone);
    final today = _day(LocalDate.fromParts(local.year, local.month, local.day));
    final due = _day(dueDate), first = today - 7, last = today + 90;
    final plans = <PlannedReminder>[];
    void append(ReminderPhase phase, int day) {
      if (day < first || day > last) return;
      final target = _date(day);
      if (target == null) return;
      final base = switch (phase) {
        ReminderPhase.confirmation => ReminderKind.automaticConfirmation,
        ReminderPhase.overdue => ReminderKind.overdue,
        ReminderPhase.due => ReminderKind.dueToday,
        ReminderPhase.upcoming =>
          subject.paymentMode == PaymentMode.manual
              ? ReminderKind.upcoming
              : ReminderKind.automaticUpcoming,
      };
      if (!preferences.enabledKinds.contains(base)) return;
      final kind = subject.section == ObligationSection.owedToMe
          ? ReminderKind.owedToMe
          : base;
      if (!preferences.enabledKinds.contains(kind)) return;
      plans.add(
        PlannedReminder(
          kind: kind,
          phase: phase,
          civilTargetDate: target,
          scheduledAt: afterQuietHours(
            phase == ReminderPhase.confirmation &&
                    subject.confirmationAt != null
                ? subject.confirmationAt!
                : ScheduledTime.resolve(
                    target,
                    policy?.localTime ?? preferences.localTime,
                    subject.timezone,
                  ),
            profileTimezone,
            preferences.quietStart,
            preferences.quietEnd,
          ),
        ),
      );
    }

    for (final offset in policy?.offsetDays ?? preferences.offsetDays) {
      append(
        offset == 0 ? ReminderPhase.due : ReminderPhase.upcoming,
        due - offset,
      );
    }
    for (final offset in [1, 3, 7]) {
      append(ReminderPhase.overdue, due + offset);
    }
    var multiple = ((first - due) / 7).ceil();
    if (multiple < 2) multiple = 2;
    for (; due + multiple * 7 <= last; multiple++) {
      append(ReminderPhase.overdue, due + multiple * 7);
    }
    if (subject.paymentMode != PaymentMode.manual &&
        subject.requiresDeductionConfirmation) {
      final instant = subject.confirmationAt;
      final day = instant == null
          ? due
          : _day(
              LocalDate.fromParts(
                TimezoneCatalog.at(instant, subject.timezone).year,
                TimezoneCatalog.at(instant, subject.timezone).month,
                TimezoneCatalog.at(instant, subject.timezone).day,
              ),
            );
      append(ReminderPhase.confirmation, day);
    }
    plans.sort((a, b) {
      final time = a.scheduledAt.compareTo(b.scheduledAt);
      return time != 0 ? time : a.kind.name.compareTo(b.kind.name);
    });
    return List.unmodifiable(plans);
  }
}
