import '../../../core/identifiers/entity_ids.dart';
import 'reminder_entry.dart';

final class NotificationPreferences {
  NotificationPreferences._({
    required this.owner,
    required this.revision,
    required this.enabled,
    required List<ReminderKind> enabledKinds,
    required List<int> offsetDays,
    required this.localTime,
    required this.quietStart,
    required this.quietEnd,
    required this.pushEnabled,
    required this.localEnabled,
  }) : enabledKinds = List.unmodifiable(enabledKinds),
       offsetDays = List.unmodifiable(offsetDays);

  factory NotificationPreferences.defaults(OwnerUid owner) =>
      NotificationPreferences.fromPolicyMap(owner, {
        'enabled': true,
        'enabledKinds': ReminderKind.values.map((kind) => kind.name).toList(),
        'offsetDays': [3, 0],
        'localTime': '09:00',
        'quietStart': '21:00',
        'quietEnd': '08:00',
        'pushEnabled': false,
        'localEnabled': false,
        'allowSensitivePushText': false,
        'timezonePolicy': 'savedDueProfileQuiet',
      });

  factory NotificationPreferences.fromPolicyMap(
    OwnerUid owner,
    Map<String, Object?> raw, {
    int revision = 1,
  }) {
    if (raw.length != _fields.length ||
        !_fields.every(raw.containsKey) ||
        revision < 1 ||
        revision >= 9007199254740991 ||
        raw['allowSensitivePushText'] != false ||
        raw['timezonePolicy'] != 'savedDueProfileQuiet') {
      throw ArgumentError('Invalid notification preferences.');
    }
    bool flag(String key) {
      final value = raw[key];
      if (value is! bool) throw ArgumentError('Invalid notification choice.');
      return value;
    }

    String time(String key) {
      final value = raw[key];
      if (value is! String || !validTime(value)) {
        throw ArgumentError('Enter a time from 00:00 to 23:59.');
      }
      return value;
    }

    final rawKinds = raw['enabledKinds'], rawOffsets = raw['offsetDays'];
    if (rawKinds is! List ||
        rawOffsets is! List ||
        rawKinds.length > ReminderKind.values.length ||
        rawKinds.toSet().length != rawKinds.length ||
        rawOffsets.length > 8 ||
        rawOffsets.toSet().length != rawOffsets.length) {
      throw ArgumentError('Choose valid reminder categories and days.');
    }
    final kinds = <ReminderKind>[];
    for (final value in rawKinds) {
      final matches = ReminderKind.values.where((kind) => kind.name == value);
      if (matches.isEmpty) {
        throw ArgumentError('Unsupported reminder category.');
      }
      kinds.add(matches.single);
    }
    final offsets = <int>[];
    for (final value in rawOffsets) {
      if (value is! int || value < 0 || value > 365) {
        throw ArgumentError(
          'Choose up to eight distinct reminder days from 0 to 365.',
        );
      }
      offsets.add(value);
    }
    return NotificationPreferences._(
      owner: owner,
      revision: revision,
      enabled: flag('enabled'),
      enabledKinds: kinds,
      offsetDays: offsets,
      localTime: time('localTime'),
      quietStart: time('quietStart'),
      quietEnd: time('quietEnd'),
      pushEnabled: flag('pushEnabled'),
      localEnabled: flag('localEnabled'),
    );
  }

  static bool validTime(String value) =>
      value.length == 5 &&
      RegExp(r'^(?:[01]\d|2[0-3]):[0-5]\d$').hasMatch(value);
  static const _fields = {
    'enabled',
    'enabledKinds',
    'offsetDays',
    'localTime',
    'quietStart',
    'quietEnd',
    'pushEnabled',
    'localEnabled',
    'allowSensitivePushText',
    'timezonePolicy',
  };
  final OwnerUid owner;
  final int revision;
  final bool enabled, pushEnabled, localEnabled;
  final List<ReminderKind> enabledKinds;
  final List<int> offsetDays;
  final String localTime, quietStart, quietEnd;
  Map<String, Object?> toPolicyMap() => {
    'enabled': enabled,
    'enabledKinds': enabledKinds.map((kind) => kind.name).toList(),
    'offsetDays': offsetDays,
    'localTime': localTime,
    'quietStart': quietStart,
    'quietEnd': quietEnd,
    'pushEnabled': pushEnabled,
    'localEnabled': localEnabled,
    'allowSensitivePushText': false,
    'timezonePolicy': 'savedDueProfileQuiet',
  };
}
