import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/dates/local_date.dart';
import 'package:tally/core/dates/scheduled_time.dart';
import 'package:tally/features/recurring/domain/recurrence_rule.dart';

void main() {
  final fixtures = jsonDecode(
    File('firebase/fixtures/recurrence.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  final cases = (fixtures['cases'] as List).cast<Map<String, dynamic>>();
  for (final fixture in cases) {
    test('recurrence: ${fixture['name']}', () {
      final rule = RecurrenceRule.fromMap(
        Map<String, Object?>.from(fixture['rule'] as Map),
      );
      final expected = (fixture['expected'] as List).cast<String>();
      final result = rule.occurrencesThrough(
        afterExclusive: null,
        through: LocalDate.parse(expected.last),
      );
      expect(
        result.occurrences.map((value) => value.date.toString()),
        expected,
      );
      expect(result.hasMore, isFalse);
      final last = result.occurrences.last;
      expect(rule.occurrenceAt(last.index), last.date);
      if (rule.endDate != null || last.date.toString() == '2199-12-31') {
        expect(rule.nextOccurrence(last.date), isNull);
      }
      expect(rule.toMap(), fixture['rule']);
    });
  }
  for (final fixture
      in (fixtures['instants'] as List).cast<Map<String, dynamic>>()) {
    test('scheduled instant: ${fixture['name']}', () {
      expect(
        ScheduledTime.resolve(
          LocalDate.parse(fixture['date'] as String),
          fixture['time'] as String,
          fixture['zone'] as String,
        ),
        DateTime.parse(fixture['instant'] as String),
      );
    });
  }
  test(
    'recurrence validation rejects forged rules and ambiguous time inputs',
    () {
      final base = Map<String, Object?>.from(cases.first['rule'] as Map);
      for (final patch in <Map<String, Object?>>[
        {'frequency': 'hourly'},
        {'unit': 'hours'},
        {'interval': 0},
        {'interval': 1.5},
        {'interval': 366},
        {'interval': 2},
        {'preferredDay': 0},
        {'preferredDay': 32},
        {'preferredDay': null},
        {'monthEnd': 'true'},
        {'ruleVersion': 0},
        {'anchorDate': '2026-02-30'},
        {'startDate': '1899-12-31'},
        {'startDate': '2025-01-01'},
        {'endDate': '2026-01-30'},
        {'timezone': 'Not/A_Zone'},
        {'timezone': '+08:00'},
        {'localDeductionTime': '24:00'},
        {'localDeductionTime': '9:00'},
        {'localDeductionTime': '09:00:00'},
        {'unknown': 1},
      ]) {
        expect(
          () => RecurrenceRule.fromMap({...base, ...patch}),
          throwsA(anything),
        );
      }
      final rule = RecurrenceRule.fromMap(base);
      for (final index in [-1, 9007199254740991]) {
        expect(() => rule.occurrenceAt(index), throwsA(anything));
      }
      for (final limit in [0, 31]) {
        expect(
          () => rule.occurrencesThrough(
            afterExclusive: null,
            through: LocalDate.parse('2026-12-31'),
            limit: limit,
          ),
          throwsA(anything),
        );
      }
      expect(
        () => ScheduledTime.resolve(
          LocalDate.parse('2026-10-04'),
          '24:00',
          'Asia/Manila',
        ),
        throwsA(anything),
      );
      expect(
        () => ScheduledTime.resolve(
          LocalDate.parse('2026-10-04'),
          '09:00',
          'bad',
        ),
        throwsA(anything),
      );
    },
  );
  test(
    'daily continuation conserves every key and directly seeks centuries ahead',
    () {
      final rule = RecurrenceRule.fromMap({
        ...Map<String, Object?>.from(cases.first['rule'] as Map),
        'frequency': 'custom',
        'unit': 'days',
        'interval': 1,
        'preferredDay': null,
        'anchorDate': '1900-01-01',
        'startDate': '1900-01-01',
      });
      final through = LocalDate.parse('1900-03-05');
      final first = rule.occurrencesThrough(
        afterExclusive: null,
        through: through,
      );
      final second = rule.occurrencesThrough(
        afterExclusive: first.occurrences.last.date,
        through: through,
      );
      final last = rule.occurrencesThrough(
        afterExclusive: second.occurrences.last.date,
        through: through,
      );
      expect(first.occurrences.length, 30);
      expect(first.hasMore, isTrue);
      expect(second.occurrences.length, 30);
      expect(second.hasMore, isTrue);
      expect(last.occurrences.length, 4);
      expect(last.hasMore, isFalse);
      expect(
        [
          ...first.occurrences,
          ...second.occurrences,
          ...last.occurrences,
        ].map((row) => row.date).toSet().length,
        64,
      );
      expect(
        rule.nextOccurrence(LocalDate.parse('2199-12-30'))!.date.toString(),
        '2199-12-31',
      );
      expect(rule.nextOccurrence(LocalDate.parse('2199-12-31')), isNull);
    },
  );
}
