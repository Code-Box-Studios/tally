import 'package:flutter/material.dart';

import '../../../core/dates/local_date.dart';
import '../../../core/dates/timezone_catalog.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../domain/recurrence_rule.dart';

String recurrenceLabel(RecurrenceFrequency frequency) => switch (frequency) {
  RecurrenceFrequency.weekly => 'Weekly',
  RecurrenceFrequency.biweekly => 'Every 2 weeks',
  RecurrenceFrequency.monthly => 'Monthly',
  RecurrenceFrequency.quarterly => 'Quarterly',
  RecurrenceFrequency.yearly => 'Yearly',
  RecurrenceFrequency.custom => 'Custom',
};

class RecurrenceEditor extends StatefulWidget {
  const RecurrenceEditor({
    super.key,
    required this.timezone,
    required this.startDate,
    this.initial,
  });
  final String timezone;
  final LocalDate startDate;
  final RecurrenceRule? initial;
  @override
  State<RecurrenceEditor> createState() => RecurrenceEditorState();
}

class RecurrenceEditorState extends State<RecurrenceEditor> {
  late final TextEditingController _start, _end, _zone, _time, _interval, _day;
  late RecurrenceFrequency _frequency;
  late RecurrenceUnit _unit;
  late bool _monthEnd;
  @override
  void initState() {
    super.initState();
    final rule = widget.initial;
    _frequency = rule?.frequency ?? RecurrenceFrequency.monthly;
    _unit = rule?.unit ?? RecurrenceUnit.months;
    _monthEnd = rule?.monthEnd ?? false;
    _start = TextEditingController(
      text: (rule?.startDate ?? widget.startDate).toString(),
    );
    _end = TextEditingController(text: rule?.endDate?.toString());
    _zone = TextEditingController(text: rule?.timezone ?? widget.timezone);
    _time = TextEditingController(text: rule?.localDeductionTime ?? '09:00');
    _interval = TextEditingController(text: (rule?.interval ?? 1).toString());
    _day = TextEditingController(
      text: (rule?.preferredDay ?? widget.startDate.day).toString(),
    );
  }

  @override
  void dispose() {
    for (final controller in [_start, _end, _zone, _time, _interval, _day]) {
      controller.dispose();
    }
    super.dispose();
  }

  bool get _calendar => switch (_frequency) {
    RecurrenceFrequency.monthly ||
    RecurrenceFrequency.quarterly ||
    RecurrenceFrequency.yearly => true,
    RecurrenceFrequency.custom =>
      _unit == RecurrenceUnit.months || _unit == RecurrenceUnit.years,
    _ => false,
  };
  RecurrenceRule value() {
    final start = LocalDate.parse(_start.text.trim());
    return RecurrenceRule(
      frequency: _frequency,
      anchorDate: widget.initial?.anchorDate ?? start,
      startDate: start,
      endDate: _end.text.trim().isEmpty
          ? null
          : LocalDate.parse(_end.text.trim()),
      timezone: _zone.text.trim(),
      localDeductionTime: _time.text.trim(),
      unit: _unit,
      interval: int.tryParse(_interval.text),
      preferredDay: _calendar ? int.tryParse(_day.text) : null,
      monthEnd: _calendar && _monthEnd,
      ruleVersion: widget.initial?.ruleVersion ?? 1,
    );
  }

  @override
  Widget build(BuildContext context) {
    final preview = <LocalDate>[];
    try {
      final rule = value();
      LocalDate? after = widget.initial == null ? null : widget.startDate;
      for (var i = 0; i < 3; i++) {
        final next = rule.nextOccurrence(after);
        if (next == null) break;
        preview.add(next.date);
        after = next.date;
      }
    } catch (_) {}
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Schedule', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 16),
        DropdownButtonFormField<RecurrenceFrequency>(
          key: const Key('recurrence-frequency'),
          initialValue: _frequency,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Frequency'),
          items: [
            for (final value in RecurrenceFrequency.values)
              DropdownMenuItem(
                value: value,
                child: Text(recurrenceLabel(value)),
              ),
          ],
          onChanged: (value) => setState(() {
            _frequency = value!;
          }),
        ),
        if (_frequency == RecurrenceFrequency.custom) ...[
          const SizedBox(height: 18),
          TextFormField(
            key: const Key('recurrence-interval'),
            controller: _interval,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Repeat every'),
            onChanged: (_) => setState(() {}),
            validator: (value) =>
                int.tryParse(value ?? '') == null ||
                    int.parse(value!) < 1 ||
                    int.parse(value) > 365
                ? 'Choose 1 to 365.'
                : null,
          ),
          const SizedBox(height: 18),
          DropdownButtonFormField<RecurrenceUnit>(
            initialValue: _unit,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Unit'),
            items: [
              for (final value in RecurrenceUnit.values)
                DropdownMenuItem(value: value, child: Text(value.name)),
            ],
            onChanged: (value) => setState(() => _unit = value!),
          ),
        ],
        const SizedBox(height: 18),
        TextFormField(
          key: const Key('recurrence-start'),
          controller: _start,
          decoration: const InputDecoration(
            labelText: 'Start date (YYYY-MM-DD)',
          ),
          validator: dateValidation,
          onChanged: (_) => setState(() {
            if (widget.initial == null) {
              try {
                _day.text = LocalDate.parse(_start.text).day.toString();
              } catch (_) {}
            }
          }),
        ),
        const SizedBox(height: 18),
        TextFormField(
          key: const Key('recurrence-end'),
          controller: _end,
          decoration: const InputDecoration(
            labelText: 'End date (optional, YYYY-MM-DD)',
          ),
          validator: (value) =>
              dateValidation(value, optional: true) ??
              ((value ?? '').trim().isNotEmpty &&
                      dateValidation(_start.text) == null &&
                      LocalDate.parse(value!.trim())
                              .compareTo(LocalDate.parse(_start.text.trim())) <
                          0
                  ? 'Choose an end date on or after the start date.'
                  : null),
          onChanged: (_) => setState(() {}),
        ),
        if (_calendar) ...[
          const SizedBox(height: 18),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Use the last day of the month'),
            value: _monthEnd,
            onChanged: (value) => setState(() => _monthEnd = value!),
          ),
          if (!_monthEnd)
            TextFormField(
              key: const Key('recurrence-day'),
              controller: _day,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Preferred day (1–31)',
              ),
              onChanged: (_) => setState(() {}),
              validator: (value) =>
                  int.tryParse(value ?? '') == null ||
                      int.parse(value!) < 1 ||
                      int.parse(value) > 31
                  ? 'Choose a day from 1 to 31.'
                  : null,
            ),
          const SizedBox(height: 8),
          const Text(
            'Short months use their last day. The original preferred day returns in longer months.',
          ),
        ],
        const SizedBox(height: 18),
        TextFormField(
          key: const Key('recurrence-zone'),
          controller: _zone,
          decoration: const InputDecoration(
            labelText: 'Saved timezone',
            helperText: 'For example, Asia/Manila',
          ),
          validator: (value) => TimezoneCatalog.contains((value ?? '').trim())
              ? null
              : 'Choose a valid IANA timezone.',
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 18),
        TextFormField(
          key: const Key('recurrence-time'),
          controller: _time,
          decoration: const InputDecoration(
            labelText: 'Deduction time (HH:mm)',
          ),
          validator: (value) =>
              RegExp(r'^(?:[01]\d|2[0-3]):[0-5]\d$')
                  .hasMatch((value ?? '').trim())
              ? null
              : 'Use 00:00 to 23:59.',
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 18),
        Text('Next dates', style: Theme.of(context).textTheme.titleSmall),
        if (preview.isEmpty)
          const Text('Check the schedule to preview upcoming dates.')
        else
          for (final date in preview)
            Padding(
              padding: const EdgeInsets.only(top: 7),
              child: Text(date.toString()),
            ),
        const SizedBox(height: 7),
        const Text(
          'Dates stay in this bill’s saved timezone, even if your profile timezone changes.',
        ),
      ],
    );
  }
}
