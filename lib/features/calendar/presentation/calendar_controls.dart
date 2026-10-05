import 'package:flutter/material.dart';

import '../../../core/dates/local_date.dart';
import '../../../core/dates/year_month.dart';

const calendarMonthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

class CalendarControls extends StatelessWidget {
  const CalendarControls({
    super.key,
    required this.month,
    required this.previous,
    required this.next,
    required this.onToday,
    required this.onChooseDay,
    required this.onWholeMonth,
    required this.selected,
  });
  final YearMonth month;
  final VoidCallback? previous, next;
  final VoidCallback onToday, onChooseDay, onWholeMonth;
  final LocalDate? selected;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Wrap(
        spacing: 12,
        runSpacing: 12,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text(
            '${calendarMonthNames[month.month - 1]} ${month.year}',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                key: const Key('calendar-previous'),
                tooltip: 'Previous month',
                onPressed: previous,
                icon: const Icon(Icons.chevron_left),
              ),
              IconButton(
                key: const Key('calendar-next'),
                tooltip: 'Next month',
                onPressed: next,
                icon: const Icon(Icons.chevron_right),
              ),
            ],
          ),
          OutlinedButton(onPressed: onToday, child: const Text('Today')),
          OutlinedButton(
            onPressed: onChooseDay,
            child: const Text('Choose day'),
          ),
          if (selected != null)
            TextButton(
              onPressed: onWholeMonth,
              child: const Text('Show whole month'),
            ),
        ],
      ),
      if (selected != null)
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Text('Selected day · $selected'),
        ),
    ],
  );
}
