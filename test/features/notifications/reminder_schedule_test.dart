import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/dates/local_date.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/notifications/domain/notification_preferences.dart';
import 'package:tally/features/notifications/domain/reminder_entry.dart';
import 'package:tally/features/notifications/domain/reminder_schedule.dart';
import 'package:tally/features/obligations/domain/obligation.dart';
import 'package:tally/features/recurring/domain/recurring_schedule.dart';

void main() {
  final owner = OwnerUid('alice');
  final prefs = NotificationPreferences.defaults(owner);
  final now = DateTime.utc(2026, 10, 5, 4);
  ReminderSubject subject({
    String due = '2026-10-10',
    String zone = 'Asia/Manila',
    PaymentMode mode = PaymentMode.manual,
    ObligationSection section = ObligationSection.monthlyDues,
    bool closed = false,
    int? remainingMinor = 169900,
    ReminderPolicy? policy,
    bool confirmation = false,
  }) => ReminderSubject(
    instanceId: InstanceId('bill-october'),
    obligationId: ObligationId('internet'),
    section: section,
    dueDate: LocalDate.parse(due),
    timezone: zone,
    paymentMode: mode,
    closed: closed,
    remainingMinor: remainingMinor,
    requiresDeductionConfirmation: confirmation,
    reminderPolicy: policy,
  );

  test('native civil plans match server due dates and overdue cadence', () {
    final plans = ReminderSchedule.plan(subject(), prefs, 'Asia/Manila', now);
    expect(
      plans
          .where((p) => p.phase != ReminderPhase.overdue)
          .map(
            (p) => [
              p.kind.name,
              p.civilTargetDate.toString(),
              p.scheduledAt.toIso8601String(),
            ],
          )
          .toList(),
      [
        ['upcoming', '2026-10-07', '2026-10-07T01:00:00.000Z'],
        ['dueToday', '2026-10-10', '2026-10-10T01:00:00.000Z'],
      ],
    );
    expect(
      plans
          .where((p) => p.phase == ReminderPhase.overdue)
          .take(5)
          .map((p) => p.civilTargetDate.toString())
          .toList(),
      ['2026-10-11', '2026-10-13', '2026-10-17', '2026-10-24', '2026-10-31'],
    );
  });
  test('saved spring gap is postponed in profile quiet zone', () {
    final quiet = NotificationPreferences.fromPolicyMap(owner, {
      ...prefs.toPolicyMap(),
      'quietStart': '14:00',
      'quietEnd': '16:00',
    });
    final plans = ReminderSchedule.plan(
      subject(
        due: '2026-03-08',
        zone: 'America/New_York',
        policy: ReminderPolicy(
          enabled: true,
          offsetDays: [0],
          localTime: '02:30',
        ),
      ),
      quiet,
      'Asia/Manila',
      DateTime.utc(2026, 3, 6),
    );
    expect(
      plans.firstWhere((p) => p.phase == ReminderPhase.due).scheduledAt,
      DateTime.utc(2026, 3, 8, 8),
    );
  });
  for (final row in [
    (
      '2026-10-05T13:00:00Z',
      'Asia/Manila',
      '21:00',
      '08:00',
      '2026-10-06T00:00:00Z',
    ),
    (
      '2026-10-05T00:00:00Z',
      'Asia/Manila',
      '21:00',
      '08:00',
      '2026-10-05T00:00:00Z',
    ),
    (
      '2026-10-05T09:00:00Z',
      'Asia/Manila',
      '17:00',
      '19:00',
      '2026-10-05T11:00:00Z',
    ),
    (
      '2026-10-05T09:00:00Z',
      'Asia/Manila',
      '17:00',
      '17:00',
      '2026-10-05T09:00:00Z',
    ),
    (
      '2026-11-01T05:30:00Z',
      'America/New_York',
      '01:00',
      '02:00',
      '2026-11-01T07:00:00Z',
    ),
    (
      '2026-03-08T06:45:00Z',
      'America/New_York',
      '01:00',
      '02:30',
      '2026-03-08T07:00:00Z',
    ),
    (
      '2026-11-01T06:15:00Z',
      'America/New_York',
      '00:00',
      '01:30',
      '2026-11-01T06:30:00Z',
    ),
  ]) {
    test('quiet hours ${row.$1} ${row.$2} ${row.$3}–${row.$4}', () {
      expect(
        ReminderSchedule.afterQuietHours(
          DateTime.parse(row.$1),
          row.$2,
          row.$3,
          row.$4,
        ),
        DateTime.parse(row.$5),
      );
    });
  }
  test('century overdue plan stays bounded to retained upcoming window', () {
    final plans = ReminderSchedule.plan(
      subject(due: '1926-10-05'),
      prefs,
      'Asia/Manila',
      now,
    );
    expect(plans.length, inInclusiveRange(1, 15));
    expect(
      plans.every(
        (p) => p.civilTargetDate.compareTo(LocalDate.parse('2026-09-28')) >= 0,
      ),
      isTrue,
    );
    expect(
      plans.every(
        (p) => p.civilTargetDate.compareTo(LocalDate.parse('2027-01-03')) <= 0,
      ),
      isTrue,
    );
  });
  test(
    'disabled, closed and paid periods suppress alerts; unknown stays useful',
    () {
      for (final s in [
        subject(closed: true),
        subject(remainingMinor: 0),
        subject(
          policy: ReminderPolicy(
            enabled: false,
            offsetDays: [0],
            localTime: '09:00',
          ),
        ),
      ]) {
        expect(ReminderSchedule.plan(s, prefs, 'Asia/Manila', now), isEmpty);
      }
      expect(
        ReminderSchedule.plan(
          subject(remainingMinor: null),
          prefs,
          'Asia/Manila',
          now,
        ),
        isNotEmpty,
      );
    },
  );
  test('confirmation and owed-to-me kinds never imply payment', () {
    final confirmation = ReminderSchedule.plan(
      subject(mode: PaymentMode.automaticConfirmation, confirmation: true),
      prefs,
      'Asia/Manila',
      now,
    );
    expect(
      confirmation
          .where((p) => p.kind == ReminderKind.automaticConfirmation)
          .length,
      1,
    );
    final owed = ReminderSchedule.plan(
      subject(section: ObligationSection.owedToMe),
      prefs,
      'Asia/Manila',
      now,
    );
    expect(owed.every((p) => p.kind == ReminderKind.owedToMe), isTrue);
  });
  test('confirmation stays on its original date after the first day', () {
    final plans = ReminderSchedule.plan(
      subject(mode: PaymentMode.automaticConfirmation, confirmation: true),
      prefs,
      'Asia/Manila',
      DateTime.utc(2026, 10, 11, 11),
    );
    expect(
      plans
          .singleWhere((p) => p.kind == ReminderKind.automaticConfirmation)
          .civilTargetDate
          .toString(),
      '2026-10-10',
    );
  });
}
