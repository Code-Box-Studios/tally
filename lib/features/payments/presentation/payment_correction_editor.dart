import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/dates/local_date.dart';
import '../../../core/money/money.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/catalog.dart';
import '../../../shared/domain/financial_failure.dart';
import '../../../shared/presentation/financial_actions.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/presentation/financial_providers.dart';
import '../../../shared/widgets/catalog_picker.dart';
import '../../../shared/widgets/financial_labels.dart';
import '../../auth/presentation/auth_providers.dart';
import '../../obligations/domain/obligation.dart';
import '../../obligations/domain/installment_periods.dart';
import '../../obligations/presentation/installment_providers.dart';
import '../domain/allocation_preview.dart';
import 'payment_allocations.dart';
import '../domain/payment_commands.dart';
import '../domain/payment_entry.dart';

class PaymentCorrectionEditor extends ConsumerStatefulWidget {
  const PaymentCorrectionEditor({
    super.key,
    required this.obligation,
    required this.original,
  });
  final Obligation obligation;
  final PaymentEntry original;
  @override
  ConsumerState<PaymentCorrectionEditor> createState() =>
      _PaymentCorrectionEditorState();
}

class _PaymentCorrectionEditorState
    extends ConsumerState<PaymentCorrectionEditor> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _reason, _amount, _date, _notes;
  bool _replace = false, _submitted = false;
  PaymentCorrection? _pending;
  late PaymentMethod _method;
  SourceId? _source;
  String _sourceName = 'No source selected';
  @override
  void initState() {
    super.initState();
    final original = widget.original;
    _reason = TextEditingController();
    _amount = TextEditingController(text: moneyEntry(original.amount));
    _date = TextEditingController(text: original.date.toString());
    _notes = TextEditingController(text: original.notes);
    _source = original.sourceId;
    _sourceName = original.source?.name ?? _sourceName;
    _method = original.method;
  }

  @override
  void dispose() {
    for (final value in [_reason, _amount, _date, _notes]) {
      value.dispose();
    }
    super.dispose();
  }

  Future<void> _sourcePicker() async {
    final catalog = ref.read(catalogRepositoryProvider);
    final selected = await pickCatalog<PaymentSource>(
      context,
      title: 'Choose a payment source',
      stream: catalog.watchSources(),
      more: (cursor) => catalog.getSources(after: cursor),
      label: (value) => value.name,
      active: (value) => value.active,
    );
    if (mounted && selected != null) {
      setState(() {
        _source = selected.id;
        _sourceName = selected.name;
      });
    }
  }

  Future<void> _save() async {
    if (_pending != null) {
      await _submitPending();
      return;
    }
    if (!_form.currentState!.validate()) return;
    setState(() => _submitted = true);
    _pending = PaymentCorrection(
      paymentId: widget.original.id,
      reason: _reason.text.trim(),
      expectedObligationRevision: widget.obligation.revision,
      replacement: !_replace
          ? null
          : PaymentTerms(
              amount: Money.parse(
                _amount.text,
                widget.original.amount.currency,
              ),
              date: LocalDate.parse(_date.text.trim()),
              sourceId: _source,
              method: _method,
              notes: _notes.text.trim(),
            ),
    );
    await _submitPending();
  }

  Future<void> _submitPending() async {
    final result = await ref
        .read(financialActionsProvider.notifier)
        .correctPayment(_pending!);
    if (!mounted) return;
    if (result != null) {
      Navigator.pop(context, result);
      return;
    }
    final error = ref.read(financialActionsProvider).error;
    final uncertain =
        error is FinancialFailure &&
        (error.code == FinancialFailureCode.offline ||
            error.code == FinancialFailureCode.unavailable);
    setState(() {
      if (!uncertain) _pending = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final action = ref.watch(financialActionsProvider);
    final installment = widget.obligation.type == ObligationType.installment;
    List<PaymentAllocation>? preview;
    bool complete = !installment;
    if (installment) {
      final state = ref.watch(
        installmentInstancesProvider(widget.obligation.id),
      );
      try {
        final periods = InstallmentPeriods.checked(
          widget.obligation,
          state.asData?.value.items ?? [],
        );
        complete = true;
        if (_replace) {
          preview = AllocationPreview.forPayment(
            Money.parse(_amount.text, widget.original.amount.currency),
            periods,
            restore: widget.original.allocations,
            expectedInstanceIds: widget.obligation.installmentInstanceIds,
          );
        }
      } catch (_) {}
    }
    return Form(
      key: _form,
      child: FinancialDialogBody(
        title: 'Correct payment',
        children: [
          ExcludeFocus(
            excluding: _pending != null,
            child: AbsorbPointer(
              absorbing: _pending != null,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'The original payment stays in history. Tally adds a reversal and, if selected, a replacement in one save.',
                  ),
                  if (installment) ...[
                    const SizedBox(height: 18),
                    PaymentAllocations(
                      parent: widget.obligation,
                      allocations: widget.original.allocations,
                      title: 'The reversal restores these periods',
                    ),
                    if (!complete)
                      const Padding(
                        padding: EdgeInsets.only(top: 12),
                        child: Text(
                          'Loading the complete schedule. If it changed, close this correction and reopen it with current balances.',
                        ),
                      ),
                  ],
                  const SizedBox(height: 18),
                  TextFormField(
                    key: const Key('correction-reason'),
                    controller: _reason,
                    maxLength: 1000,
                    decoration: const InputDecoration(
                      labelText: 'Reason for correction',
                      counterText: '',
                    ),
                    validator: (value) => (value ?? '').trim().isEmpty
                        ? 'Tell us why this payment needs correcting.'
                        : null,
                  ),
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Add a corrected replacement payment'),
                    value: _replace,
                    onChanged: (value) => setState(() => _replace = value!),
                  ),
                  if (_replace) ...[
                    TextFormField(
                      key: const Key('correction-amount'),
                      controller: _amount,
                      onChanged: (_) => setState(() {}),
                      decoration: InputDecoration(
                        labelText:
                            'Corrected amount (${widget.original.amount.currency.code})',
                      ),
                      validator: (value) =>
                          amountValidation(
                            value,
                            widget.original.amount.currency,
                          ) ??
                          (Money.parse(
                                    value!,
                                    widget.original.amount.currency,
                                  ).minorUnits >
                                  widget.obligation.remainingAmount!
                                      .add(widget.original.amount)
                                      .minorUnits
                              ? 'This payment exceeds the remaining balance after reversal.'
                              : null),
                    ),
                    const SizedBox(height: 18),
                    TextFormField(
                      controller: _date,
                      decoration: const InputDecoration(
                        labelText: 'Corrected date (YYYY-MM-DD)',
                      ),
                      validator: (value) =>
                          dateValidation(value) ??
                          (LocalDate.parse(value!.trim()).compareTo(
                                        widget.obligation.originationDate,
                                      ) <
                                      0 ||
                                  LocalDate.parse(value.trim()).compareTo(
                                        todayIn(
                                          ref
                                              .read(userProfileProvider)
                                              .timezone,
                                        ),
                                      ) >
                                      0
                              ? 'Choose a date between the borrowed or lent date and today.'
                              : null),
                    ),
                    if (installment) ...[
                      const SizedBox(height: 18),
                      const Text(
                        'The replacement pays the earliest outstanding installments after this reversal. It can cover different periods.',
                      ),
                      const SizedBox(height: 12),
                      if (preview != null)
                        PaymentAllocations(
                          parent: widget.obligation,
                          allocations: preview,
                          title: 'Replacement payment covers',
                        )
                      else
                        const Text(
                          'Enter an amount that fits within 24 periods and the balance after reversal.',
                        ),
                    ],
                    const SizedBox(height: 18),
                    DropdownButtonFormField<PaymentMethod>(
                      initialValue: _method,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Payment method',
                      ),
                      items: [
                        for (final method in PaymentMethod.values)
                          DropdownMenuItem(
                            value: method,
                            child: Text(methodLabel(method)),
                          ),
                      ],
                      onChanged: (value) => setState(() => _method = value!),
                    ),
                    const SizedBox(height: 18),
                    Wrap(
                      spacing: 8,
                      children: [
                        OutlinedButton(
                          onPressed: _sourcePicker,
                          child: Text(_sourceName),
                        ),
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
                      decoration: const InputDecoration(
                        labelText: 'Notes',
                        counterText: '',
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (_pending != null && !action.isLoading)
            const Padding(
              padding: EdgeInsets.only(top: 12),
              child: Text(
                'The save could not be confirmed. Retry the original correction to check its result. Its reason, replacement and captured balance stay the same.',
              ),
            ),
          FinancialActionError(error: _submitted ? action.error : null),
          const SizedBox(height: 12),
          FilledButton(
            key: const Key('correction-save'),
            onPressed:
                action.isLoading ||
                    (_pending == null &&
                        (!complete ||
                            (installment && _replace && preview == null)))
                ? null
                : _save,
            child: Text(
              action.isLoading
                  ? 'Saving…'
                  : _pending != null
                  ? 'Retry original correction'
                  : 'Save correction',
            ),
          ),
          TextButton(
            onPressed: action.isLoading ? null : () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
        ],
      ),
    );
  }
}
