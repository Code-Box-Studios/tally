import 'package:flutter/material.dart';

import '../../../core/dates/local_date.dart';
import '../../../core/dates/year_month.dart';

class CalendarMonth extends StatelessWidget {
  const CalendarMonth({
    super.key,
    required this.month,
    required this.counts,
    required this.today,
    required this.selected,
    required this.complete,
    required this.onSelected,
  });
  final YearMonth month;
  final Map<LocalDate, int> counts;
  final LocalDate today;
  final LocalDate? selected;
  final bool complete;
  final ValueChanged<LocalDate> onSelected;
  @override
  Widget build(BuildContext context) {
    final offset = DateTime.utc(month.year, month.month, 1).weekday - 1,
        length = month.lastDay.day,
        rows = ((offset + length) / 7).ceil();
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              complete
                  ? 'Due dates this month'
                  : 'Loaded events · counts may be incomplete',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 16),
            Table(
              children: [
                TableRow(
                  children: [
                    for (final name in [
                      'Mon',
                      'Tue',
                      'Wed',
                      'Thu',
                      'Fri',
                      'Sat',
                      'Sun',
                    ])
                      Padding(
                        padding: EdgeInsets.symmetric(vertical: 10),
                        child: Center(child: Text(name)),
                      ),
                  ],
                ),
                for (var row = 0; row < rows; row++)
                  TableRow(
                    children: [
                      for (var column = 0; column < 7; column++)
                        if (row * 7 + column - offset + 1 case final day
                            when day > 0 && day <= length)
                          Builder(
                            builder: (context) {
                              final date = LocalDate.fromParts(
                                    month.year,
                                    month.month,
                                    day,
                                  ),
                                  count = counts[date] ?? 0;
                              return Semantics(
                                button: true,
                                selected: selected == date,
                                label:
                                    '$date${today == date ? ', today' : ''}, $count ${complete ? 'due dates' : 'loaded events'}',
                                child: InkWell(
                                  key: Key('calendar-day-$date'),
                                  onTap: () => onSelected(date),
                                  child: Container(
                                    constraints: const BoxConstraints(
                                      minHeight: 76,
                                    ),
                                    margin: const EdgeInsets.all(2),
                                    padding: const EdgeInsets.all(8),
                                    decoration: BoxDecoration(
                                      color: selected == date
                                          ? scheme.primaryContainer
                                          : null,
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(
                                        color: today == date
                                            ? scheme.primary
                                            : scheme.outlineVariant,
                                      ),
                                    ),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          '$day',
                                          style: TextStyle(
                                            fontWeight: today == date
                                                ? FontWeight.w700
                                                : FontWeight.w500,
                                          ),
                                        ),
                                        if (count > 0)
                                          Padding(
                                            padding: const EdgeInsets.only(
                                              top: 10,
                                            ),
                                            child: Text(
                                              '$count due',
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .bodySmall,
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                ),
                              );
                            },
                          )
                        else
                          const SizedBox(height: 76),
                    ],
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
