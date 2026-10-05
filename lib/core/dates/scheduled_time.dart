import 'package:timezone/timezone.dart' as tz;

import 'local_date.dart';
import 'timezone_catalog.dart';

abstract final class ScheduledTime {
  static final _time = RegExp(r'^(?:[01]\d|2[0-3]):[0-5]\d$');

  static DateTime resolve(LocalDate date, String localTime, String timezone) {
    if (localTime.length != 5 ||
        !_time.hasMatch(localTime) ||
        !TimezoneCatalog.contains(timezone)) {
      throw ArgumentError('Choose a valid time and timezone.');
    }
    final parts = localTime.split(':').map(int.parse).toList();
    final wall = DateTime.utc(
      date.year,
      date.month,
      date.day,
      parts[0],
      parts[1],
    ).millisecondsSinceEpoch;
    final location = TimezoneCatalog.at(
      DateTime.utc(date.year),
      timezone,
    ).location;
    final exact = <int>[], before = <int>[], after = <int>[];
    for (final offset
        in location.zones.map((zone) => zone.offset.inMilliseconds).toSet()) {
      final candidate = wall - offset;
      final actual = location.translate(candidate);
      if (actual == wall) {
        exact.add(candidate);
      } else if (actual < wall) {
        before.add(candidate);
      } else {
        after.add(candidate);
      }
    }
    if (exact.isNotEmpty) {
      exact.sort();
      return DateTime.fromMillisecondsSinceEpoch(exact.first, isUtc: true);
    }
    // A forward transition can skip an hour, half an hour, or a whole day.
    // Select its first valid instant, rather than preserve the skipped minutes.
    before.sort();
    after.sort();
    if (before.isEmpty || after.isEmpty || before.last >= after.first) {
      throw ArgumentError('Cannot resolve scheduled time.');
    }
    var low = before.last, high = after.first;
    while (high - low > 1) {
      final middle = low + (high - low) ~/ 2;
      if (location.translate(middle) >= wall) {
        high = middle;
      } else {
        low = middle;
      }
    }
    return tz.TZDateTime.fromMillisecondsSinceEpoch(location, high).toUtc();
  }
}
