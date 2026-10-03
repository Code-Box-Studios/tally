import 'package:timezone/data/latest.dart' as data;
import 'package:timezone/timezone.dart' as tz;

abstract final class TimezoneCatalog {
  static bool _initialized = false;
  static void _initialize() {
    if (!_initialized) {
      data.initializeTimeZones();
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
}
