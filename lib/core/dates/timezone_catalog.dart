import 'package:timezone/timezone.dart' as tz;

import 'tally_timezones.g.dart';

abstract final class TimezoneCatalog {
  static bool _initialized = false;
  static void _initialize() {
    if (!_initialized) {
      initializeTallyTimezones();
      _initialized = true;
    }
  }

  static bool contains(String name) {
    _initialize();
    try {
      tz.getLocation(name);
      return true;
    } catch (_) {
      return false;
    }
  }

  static List<String> get names {
    _initialize();
    return tz.timeZoneDatabase.locations.keys.toList()..sort();
  }

  static tz.TZDateTime now(String name) {
    _initialize();
    return tz.TZDateTime.now(tz.getLocation(name));
  }

  static tz.TZDateTime at(DateTime instant, String name) {
    _initialize();
    return tz.TZDateTime.from(instant, tz.getLocation(name));
  }
}
