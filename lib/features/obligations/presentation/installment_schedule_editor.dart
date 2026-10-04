import 'package:flutter/material.dart';

import '../../../core/dates/local_date.dart';
import '../../../core/money/currency_code.dart';
import '../../../core/money/money.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/widgets/money_text.dart';
import '../domain/installment_schedule.dart';
import '../domain/obligation_instance.dart';

class InstallmentScheduleEditor extends StatefulWidget {
  const InstallmentScheduleEditor({
    super.key,
    required this.principalText,
    required this.currency,
    required this.originationText,
    this.initial = const [],
  });
  final String principalText, originationText;
  final CurrencyCode currency;
  final List<ObligationInstance> initial;
  @override
  State<InstallmentScheduleEditor> createState() =>
      InstallmentScheduleEditorState();
}

class _TermFields {
  _TermFields({String amount = '', String date = '', this.initial})
    : amount = TextEditingController(text: amount),
      date = TextEditingController(text: date);
  final TextEditingController amount, date;
  final ObligationInstance? initial;
  bool get amountLocked =>
      initial != null && initial!.hasPaymentHistory != false;
  bool get dateLocked => initial?.remainingAmount?.minorUnits == 0;
  void dispose() {
    amount.dispose();
    date.dispose();
  }
}

class InstallmentScheduleEditorState extends State<InstallmentScheduleEditor> {
  final _count = TextEditingController();
  final _terms = <_TermFields>[];
  String? _error;
  bool get _fixed => widget.initial.isNotEmpty;
  @override
  void initState() {
    super.initState();
    if (_fixed) {
      for (final instance in widget.initial) {
        _terms.add(
          _TermFields(
            amount: moneyEntry(instance.amount!),
            date: instance.dueDate!.toString(),
            initial: instance,
          ),
        );
      }
    } else {
      _terms.addAll([_TermFields(), _TermFields()]);
    }
    _count.text = _terms.length.toString();
  }

  @override
  void dispose() {
    _count.dispose();
    for (final term in _terms) {
      term.dispose();
    }
    super.dispose();
  }

  void _resize() {
    final count = int.tryParse(_count.text);
    if (count == null || count < 2 || count > 120) {
      setState(() => _error = 'Choose between 2 and 120 installments.');
      return;
    }
    setState(() {
      while (_terms.length > count) {
        _terms.removeLast().dispose();
      }
      while (_terms.length < count) {
        _terms.add(_TermFields());
      }
      _error = null;
    });
  }

  void _equal() {
    try {
      final principal = Money.parse(widget.principalText, widget.currency);
      final origin = LocalDate.parse(widget.originationText.trim());
      final schedule = InstallmentSchedule.equal(
        principal: principal,
        originationDate: origin,
        dueDates: List.filled(_terms.length, origin),
      );
      setState(() {
        for (var i = 0; i < _terms.length; i++) {
          _terms[i].amount.text = moneyEntry(schedule.terms[i].amount);
        }
        _error = null;
      });
    } catch (_) {
      setState(
        () => _error =
            'Enter a valid original amount and borrowed or lent date first.',
      );
    }
  }

  InstallmentSchedule _read() {
    final principal = Money.parse(widget.principalText, widget.currency);
    final origin = LocalDate.parse(widget.originationText.trim());
    final terms = [
      for (final fields in _terms)
        InstallmentTerm(
          Money.parse(fields.amount.text, widget.currency),
          LocalDate.parse(fields.date.text.trim()),
        ),
    ];
    var sum = Money.fromMinorUnits(0, widget.currency);
    for (final term in terms) {
      sum = sum.add(term.amount);
    }
    if (sum != principal) {
      throw const FormatException(
        'Installment amounts must equal the original amount.',
      );
    }
    return InstallmentSchedule(
      principal: principal,
      originationDate: origin,
      terms: terms,
    );
  }

  InstallmentSchedule? validate() {
    try {
      final schedule = _read();
      setState(() => _error = null);
      return schedule;
    } catch (error) {
      setState(
        () => _error = error is FormatException ? error.message.toString() : 'Enter positive amounts and valid due dates in order, on or after the borrowed or lent date.',
      );
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    InstallmentSchedule? preview;
    try {
      preview = _read();
    } catch (_) {}
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Installment schedule',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        const Text(
          'Give each installment its own amount and due date. The total must match the original amount.',
        ),
        if (!_fixed) ...[
          const SizedBox(height: 16),
          TextField(
            key: const Key('installment-count'),
            controller: _count,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Number of installments (2–120)',
            ),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              key: const Key('installment-count-apply'),
              onPressed: _resize,
              child: const Text('Apply count'),
            ),
          ),
        ],
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton(
            key: const Key('installment-equal'),
            onPressed: _terms.any((term) => term.amountLocked) ? null : _equal,
            child: const Text('Split amount equally'),
          ),
        ),
        if (_fixed)
          const Padding(
            padding: EdgeInsets.only(top: 12),
            child: Text(
              'Periods with payment history keep their amounts. Paid periods also keep their due dates.',
            ),
          ),
        for (var i = 0; i < _terms.length; i++)
          Padding(
            padding: const EdgeInsets.only(top: 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Installment ${i + 1}',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const SizedBox(height: 8),
                TextField(
                  key: Key('installment-amount-$i'),
                  controller: _terms[i].amount,
                  enabled: !_terms[i].amountLocked,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  onChanged: (_) => setState(() => _error = null),
                  decoration: InputDecoration(
                    labelText: 'Amount (${widget.currency.code})',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  key: Key('installment-date-$i'),
                  controller: _terms[i].date,
                  enabled: !_terms[i].dateLocked,
                  onChanged: (_) => setState(() => _error = null),
                  decoration: const InputDecoration(
                    labelText: 'Due date (YYYY-MM-DD)',
                  ),
                ),
              ],
            ),
          ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 14),
            child: Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        const SizedBox(height: 18),
        Text('Schedule preview', style: Theme.of(context).textTheme.titleSmall),
        if (preview == null)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('Complete every period to see the full schedule.'),
          ),
        if (preview != null)
          for (var i = 0; i < preview.terms.length; i++)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Wrap(
                spacing: 12,
                runSpacing: 5,
                children: [
                  Text('${i + 1}. Due ${preview.terms[i].dueDate}'),
                  MoneyText(money: preview.terms[i].amount, includeCode: true),
                ],
              ),
            ),
        const SizedBox(height: 20),
      ],
    );
  }
}
