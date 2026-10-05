import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/dates/local_date.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/money.dart';
import '../../../shared/domain/catalog.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/presentation/financial_providers.dart';
import '../../../shared/widgets/catalog_picker.dart';
import '../../obligations/domain/obligation.dart';
import '../../obligations/domain/obligation_instance.dart';
import '../domain/recurring_commands.dart';
import 'revisioned_action_form.dart';

class PeriodAmountDialog extends StatefulWidget {
  const PeriodAmountDialog({super.key, required this.instance});
  final ObligationInstance instance;
  @override
  State<PeriodAmountDialog> createState() => _PeriodAmountDialogState();
}

class _PeriodAmountDialogState extends State<PeriodAmountDialog> {
  late final TextEditingController _amount;
  final _reason = TextEditingController();
  @override
  void initState() {
    super.initState();
    final initial = widget.instance.amount ?? widget.instance.estimatedAmount;
    _amount = TextEditingController(
      text: initial == null ? '' : moneyEntry(initial),
    );
  }

  @override
  void dispose() {
    _amount.dispose();
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      RevisionedActionForm<InstanceAmountEdit>(
        owner: widget.instance.owner,
        title: 'Enter this bill’s amount',
        saveKey: const Key('period-save'),
        saveLabel: 'Save bill amount',
        fields: [
          Text('${widget.instance.title} · ${widget.instance.periodLabel}'),
          const SizedBox(height: 12),
          const Text(
            'This changes only this billing period. Other periods keep their own amounts and payment history.',
          ),
          const SizedBox(height: 18),
          TextFormField(
            key: const Key('period-amount'),
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: 'Bill amount (${widget.instance.currency.code})',
            ),
            validator: (value) =>
                amountValidation(value, widget.instance.currency) ??
                (Money.parse(value!, widget.instance.currency).minorUnits <= 0
                    ? 'Enter an amount greater than zero.'
                    : Money.parse(value, widget.instance.currency).minorUnits <
                          widget.instance.paidAmount.minorUnits
                    ? 'The bill amount cannot be less than its valid payments.'
                    : null),
          ),
          const SizedBox(height: 18),
          TextFormField(
            key: const Key('period-reason'),
            controller: _reason,
            maxLength: 1000,
            decoration: const InputDecoration(
              labelText: 'Reason or billing reference',
              counterText: '',
            ),
            validator: requiredText,
          ),
        ],
        payload: () => InstanceAmountEdit(
          obligationId: widget.instance.obligationId,
          instanceId: widget.instance.id,
          expectedRevision: widget.instance.revision,
          amount: Money.parse(_amount.text, widget.instance.currency),
          reason: _reason.text.trim(),
        ),
        submit: (actions, payload) => actions.setRecurringAmount(payload),
      );
}

class RecurringLifecycleDialog extends StatefulWidget {
  const RecurringLifecycleDialog({
    super.key,
    required this.parent,
    required this.action,
    required this.loadedFutureCount,
    required this.complete,
  });
  final Obligation parent;
  final RecurringLifecycleAction action;
  final int loadedFutureCount;
  final bool complete;
  @override
  State<RecurringLifecycleDialog> createState() =>
      _RecurringLifecycleDialogState();
}

class _RecurringLifecycleDialogState extends State<RecurringLifecycleDialog> {
  late final TextEditingController _date;
  @override
  void initState() {
    super.initState();
    _date = TextEditingController(
      text: todayIn(widget.parent.timezone).toString(),
    );
  }

  @override
  void dispose() {
    _date.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final label = switch (widget.action) {
      RecurringLifecycleAction.pause => 'Pause',
      RecurringLifecycleAction.resume => 'Resume',
      RecurringLifecycleAction.end => 'End',
    };
    return RevisionedActionForm<LifecycleChange>(
      owner: widget.parent.owner,
      title: '$label recurring bill',
      saveKey: const Key('lifecycle-save'),
      saveLabel: '$label schedule',
      fields: [
        Text(widget.parent.title),
        const SizedBox(height: 12),
        Text(
          widget.action == RecurringLifecycleAction.resume
              ? 'Continue generating new periods according to the saved schedule.'
              : 'Stop generating new periods from the effective date. Existing periods keep their balances, payment history and configured automatic deductions.',
        ),
        const SizedBox(height: 12),
        Text(
          '${widget.complete ? '' : 'At least '}${widget.loadedFutureCount} existing future periods in the loaded history will be kept. The server verifies the complete count when saved.',
        ),
        const SizedBox(height: 12),
        const Text(
          'Existing periods remain due until you pay or explicitly skip each unpaid period.',
        ),
        const SizedBox(height: 18),
        TextFormField(
          key: const Key('lifecycle-date'),
          controller: _date,
          decoration: const InputDecoration(
            labelText: 'Effective date (YYYY-MM-DD)',
          ),
          validator: (value) {
            final error = dateValidation(value);
            if (error != null) return error;
            final date = LocalDate.parse(value!.trim());
            if (date.compareTo(todayIn(widget.parent.timezone)) < 0) {
              return 'Choose today or a future date in this bill’s timezone.';
            }
            final ranges = widget.parent.recurrence?.pauseRanges;
            if (widget.action == RecurringLifecycleAction.resume &&
                ranges != null &&
                ranges.isNotEmpty &&
                date.compareTo(ranges.last.startDate) <= 0) {
              return 'Choose a resume date after the pause starts.';
            }
            return null;
          },
        ),
      ],
      payload: () => LifecycleChange(
        obligationId: widget.parent.id,
        expectedRevision: widget.parent.revision,
        action: widget.action,
        effectiveDate: LocalDate.parse(_date.text.trim()),
      ),
      submit: (actions, payload) => actions.changeRecurringLifecycle(payload),
    );
  }
}

class RecurringPeriodEditDialog extends ConsumerStatefulWidget {
  const RecurringPeriodEditDialog({super.key, required this.instance});
  final ObligationInstance instance;
  @override
  ConsumerState<RecurringPeriodEditDialog> createState() =>
      _RecurringPeriodEditDialogState();
}

class _RecurringPeriodEditDialogState
    extends ConsumerState<RecurringPeriodEditDialog> {
  late final TextEditingController _date, _notes;
  final _reason = TextEditingController();
  SourceId? _source;
  late String _sourceName;
  @override
  void initState() {
    super.initState();
    _date = TextEditingController(text: widget.instance.dueDate?.toString());
    _notes = TextEditingController(text: widget.instance.notes);
    _source = widget.instance.paymentSourceId;
    _sourceName = widget.instance.source?.name ?? 'No source selected';
  }

  @override
  void dispose() {
    _date.dispose();
    _notes.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _pickSource() async {
    final catalog = ref.read(catalogRepositoryProvider);
    final chosen = await pickCatalog<PaymentSource>(
      context,
      title: 'Choose a payment source',
      stream: catalog.watchSources(),
      more: (cursor) => catalog.getSources(after: cursor),
      label: (value) => value.name,
      active: (value) => value.active,
    );
    if (mounted && chosen != null) {
      setState(() {
        _source = chosen.id;
        _sourceName = chosen.name;
      });
    }
  }

  @override
  Widget build(
    BuildContext context,
  ) => RevisionedActionForm<RecurringInstanceEdit>(
    owner: widget.instance.owner,
    title: 'Edit this billing period',
    saveKey: const Key('period-save'),
    saveLabel: 'Save period changes',
    fields: [
      Text('${widget.instance.title} · ${widget.instance.periodLabel}'),
      const SizedBox(height: 12),
      const Text(
        'The original period and its payment history stay the same. These changes affect this unpaid period only.',
      ),
      const SizedBox(height: 18),
      TextFormField(
        controller: _date,
        decoration: const InputDecoration(labelText: 'Due date (YYYY-MM-DD)'),
        validator: (value) =>
            dateValidation(value) ??
            (LocalDate.parse(value!.trim())
                        .compareTo(widget.instance.occurrenceDate) <
                    0
                ? 'Choose a due date on or after the period starts.'
                : null),
      ),
      const SizedBox(height: 18),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          OutlinedButton(onPressed: _pickSource, child: Text(_sourceName)),
          if (_source != null)
            TextButton(
              onPressed: () => setState(() {
                _source = null;
                _sourceName = 'No source selected';
              }),
              child: const Text('Clear source'),
            ),
        ],
      ),
      const SizedBox(height: 18),
      TextFormField(
        controller: _notes,
        maxLength: 4000,
        decoration: const InputDecoration(labelText: 'Notes', counterText: ''),
      ),
      const SizedBox(height: 18),
      TextFormField(
        controller: _reason,
        maxLength: 1000,
        decoration: const InputDecoration(labelText: 'Reason', counterText: ''),
        validator: requiredText,
      ),
    ],
    payload: () => RecurringInstanceEdit(
      obligationId: widget.instance.obligationId,
      instanceId: widget.instance.id,
      expectedRevision: widget.instance.revision,
      dueDate: LocalDate.parse(_date.text.trim()),
      paymentSourceId: _source,
      notes: _notes.text.trim(),
      reason: _reason.text.trim(),
    ),
    submit: (actions, payload) => actions.editRecurringInstance(payload),
  );
}

class PeriodSkipDialog extends StatefulWidget {
  const PeriodSkipDialog({super.key, required this.instance});
  final ObligationInstance instance;
  @override
  State<PeriodSkipDialog> createState() => _PeriodSkipDialogState();
}

class _PeriodSkipDialogState extends State<PeriodSkipDialog> {
  final _reason = TextEditingController();
  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => RevisionedActionForm<InstanceSkip>(
    owner: widget.instance.owner,
    title: 'Skip this period',
    saveKey: const Key('period-save'),
    saveLabel: 'Skip period',
    fields: [
      Text('${widget.instance.title} · ${widget.instance.periodLabel}'),
      const SizedBox(height: 12),
      const Text(
        'This closes this unpaid period and cancels its scheduled deduction. It keeps the period and its history. Other periods are unaffected.',
      ),
      const SizedBox(height: 18),
      TextFormField(
        controller: _reason,
        maxLength: 1000,
        decoration: const InputDecoration(labelText: 'Reason', counterText: ''),
        validator: requiredText,
      ),
    ],
    payload: () => InstanceSkip(
      obligationId: widget.instance.obligationId,
      instanceId: widget.instance.id,
      expectedRevision: widget.instance.revision,
      reason: _reason.text.trim(),
    ),
    submit: (actions, payload) => actions.skipRecurringInstance(payload),
  );
}
