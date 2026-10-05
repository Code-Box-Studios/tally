import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/notifications/domain/notification_preferences.dart';
import 'package:tally/features/notifications/domain/reminder_entry.dart';

void main() {
  final owner = OwnerUid('alice');
  test(
    'default preference gives reminders without enabling external alerts',
    () {
      final p = NotificationPreferences.defaults(owner);
      expect(p.enabled, isTrue);
      expect(p.offsetDays, [3, 0]);
      expect(p.localTime, '09:00');
      expect(p.quietStart, '21:00');
      expect(p.quietEnd, '08:00');
      expect(p.enabledKinds, ReminderKind.values);
      expect(p.pushEnabled, isFalse);
      expect(p.localEnabled, isFalse);
      expect(p.toPolicyMap()['allowSensitivePushText'], isFalse);
    },
  );
  test('preference copies input lists and keeps explicit disabled choices', () {
    final offsets = <int>[7, 1, 0];
    final kinds = <String>['dueToday'];
    final p = NotificationPreferences.fromPolicyMap(owner, {
      ...NotificationPreferences.defaults(owner).toPolicyMap(),
      'enabled': false,
      'pushEnabled': true,
      'offsetDays': offsets,
      'enabledKinds': kinds,
    }, revision: 4);
    offsets.add(2);
    kinds.add('overdue');
    expect(p.offsetDays, [7, 1, 0]);
    expect(p.enabledKinds, [ReminderKind.dueToday]);
    expect(p.enabled, isFalse);
    expect(p.pushEnabled, isTrue);
    expect(p.revision, 4);
    expect(() => p.offsetDays.add(3), throwsUnsupportedError);
  });
  for (final patch in <Map<String, Object?>>[
    {'enabled': 'yes'},
    {
      'enabledKinds': ['other'],
    },
    {
      'enabledKinds': ['dueToday', 'dueToday'],
    },
    {
      'offsetDays': [1, 1],
    },
    {
      'offsetDays': [0, 1, 2, 3, 4, 5, 6, 7, 8],
    },
    {
      'offsetDays': [-1],
    },
    {
      'offsetDays': [366],
    },
    {
      'offsetDays': [1.5],
    },
    {'localTime': '24:00'},
    {'localTime': '9:00'},
    {'quietEnd': '08:00\n'},
    {'allowSensitivePushText': true},
    {'timezonePolicy': 'device'},
    {'extra': 'ignored'},
  ]) {
    test('invalid preference $patch fails before a command is created', () {
      expect(
        () => NotificationPreferences.fromPolicyMap(owner, {
          ...NotificationPreferences.defaults(owner).toPolicyMap(),
          ...patch,
        }),
        throwsArgumentError,
      );
    });
  }
}
