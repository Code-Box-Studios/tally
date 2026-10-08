import '../../sync/presentation/submission_feedback.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/dates/local_date.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/money.dart';
import '../../../shared/domain/catalog.dart';
import '../../../shared/domain/financial_failure.dart';
import '../../../shared/presentation/financial_actions.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/presentation/financial_providers.dart';
import '../../../shared/widgets/catalog_picker.dart';
import '../../../shared/widgets/financial_labels.dart';
import '../../auth/presentation/auth_providers.dart';
import '../../obligations/domain/obligation.dart';
import '../../obligations/domain/obligation_instance.dart';
import '../../obligations/domain/installment_periods.dart';
import '../../obligations/presentation/installment_providers.dart';
import '../../../shared/widgets/money_text.dart';
import '../domain/allocation_preview.dart';
import '../domain/payment_commands.dart';
import '../domain/payment_entry.dart';

class PaymentEditor extends ConsumerStatefulWidget {
  const PaymentEditor({
    super.key,
    required this.obligation,
    this.selectedInstance,
  });
  final Obligation obligation;
  final ObligationInstance? selectedInstance;
  @override
  ConsumerState<PaymentEditor> createState() => _PaymentEditorState();
}

class _PaymentEditorState extends ConsumerState<PaymentEditor> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _amount, _date, _notes;
  SourceId? _source;
  String _sourceName = 'No source selected';
  PaymentMethod _method = PaymentMethod.cash;
  bool _submitted = false;
  ({PaymentTerms terms, List<PaymentAllocation> allocations, bool spread})?
  _pending;
  InstanceId? _selected;
  bool get _installments =>
      widget.obligation.type == ObligationType.installment;
  List<ObligationInstance> _periods() => InstallmentPeriods.checked(
    widget.obligation,
    ref
            .read(installmentInstancesProvider(widget.obligation.id))
            .asData
            ?.value
            .items ??
        [],
  );
  Money get _remaining {
    if (widget.obligation.isRecurring) {
      return widget.selectedInstance!.remainingAmount!;
    }
    if (_selected == null) return widget.obligation.remainingAmount!;
    return _periods()
        .firstWhere((period) => period.id == _selected)
        .remainingAmount!;
  }

  List<PaymentAllocation> _allocations(Money amount) {
    if (widget.obligation.isRecurring) {
      final period = widget.selectedInstance!;
      if (period.owner != widget.obligation.owner ||
          period.obligationId != widget.obligation.id ||
          period.closed ||
          period.remainingAmount == null ||
          amount.minorUnits > period.remainingAmount!.minorUnits) {
        throw StateError('Review the selected billing period.');
      }
      return [PaymentAllocation(period.id, amount)];
    }
    if (!_installments) {
      return [PaymentAllocation(widget.obligation.singleInstanceId!, amount)];
    }
    final periods = _periods();
    if (_selected != null) {
      final selected = periods.firstWhere((period) => period.id == _selected);
      if (selected.closed ||
          amount.minorUnits > selected.remainingAmount!.minorUnits) {
        throw StateError('Selected installment changed.');
      }
      return [PaymentAllocation(selected.id, amount)];
    }
    return AllocationPreview.forPayment(
      amount,
      periods,
      expectedInstanceIds: widget.obligation.installmentInstanceIds,
    );
  }

  @override
  void initState() {
    super.initState();
    _selected = widget.selectedInstance?.id;
    _amount = TextEditingController(
      text: moneyEntry(
        widget.selectedInstance?.remainingAmount ??
            widget.obligation.remainingAmount!,
      ),
    );
    _date = TextEditingController(
      text: todayIn(ref.read(userProfileProvider).timezone).toString(),
    );
    _notes = TextEditingController();
    _source = widget.obligation.isRecurring
        ? widget.selectedInstance!.paymentSourceId
        : widget.obligation.paymentSourceId;
    _sourceName =
        (widget.obligation.isRecurring
                ? widget.selectedInstance!.source
                : widget.obligation.source)
            ?.name ??
        _sourceName;
  }

  @override
  void dispose() {
    _amount.dispose();
    _date.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _pickSource() async {
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
    final amount = Money.parse(_amount.text, widget.obligation.currency);
    List<PaymentAllocation> allocations;
    try {
      allocations = _allocations(amount);
    } catch (_) {
      return;
    }
    final terms = PaymentTerms(
      amount: amount,
      date: LocalDate.parse(_date.text.trim()),
      sourceId: _source,
      method: _method,
      notes: _notes.text.trim(),
    );
    _pending = (
      terms: terms,
      allocations: List.unmodifiable(allocations),
      spread: _installments && _selected == null,
    );
    await _submitPending();
  }

  Future<void> _submitPending() async {
    final pending = _pending!;
    final actions = ref.read(financialActionsProvider.notifier);
    final result = pending.spread
        ? await actions.recordInstallmentPayment(
            InstallmentPaymentDraft(
              obligationId: widget.obligation.id,
              terms: pending.terms,
              explicitAllocations: pending.allocations,
            ),
          )
        : await actions.recordPayment(
            PaymentDraft(
              obligationId: widget.obligation.id,
              instanceId: pending.allocations.single.instanceId,
              terms: pending.terms,
            ),
          );
    if (!mounted) return;
    if (result != null) {
      if (handleQueuedSubmission(context, result, closeDialog: true)) return;
      Navigator.pop(context, result.acceptedValue);
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
    final parent = widget.obligation;
    final received = parent.direction == ObligationDirection.owedToMe;
    List<ObligationInstance> periods = [];
    Object? periodError;
    bool cached = false;
    if (_installments) {
      final state = ref.watch(installmentInstancesProvider(parent.id));
      cached = state.asData?.value.isFromCache ?? false;
      periodError = state.error;
      try {
        periods = InstallmentPeriods.checked(
          parent,
          state.asData?.value.items ?? [],
        );
      } catch (_) {}
    }
    List<PaymentAllocation>? preview;
    Money? entered;
    try {
      entered = Money.parse(_amount.text, parent.currency);
      if (entered.minorUnits <= _remaining.minorUnits) {
        preview = _allocations(entered);
      }
    } catch (_) {}
    return Form(
      key: _form,
      child: FinancialDialogBody(
        title: received ? 'Record repayment' : 'Record payment',
        children: [
          ExcludeFocus(
            excluding: _pending != null,
            child: AbsorbPointer(
              absorbing: _pending != null,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(parent.title),
                  if (parent.isRecurring)
                    Text(
                      'Billing period: ${widget.selectedInstance!.periodLabel}',
                    ),
                  const SizedBox(height: 6),
                  const Text(
                    'Record a full, partial or custom amount. Each payment keeps its own history.',
                  ),
                  const SizedBox(height: 20),
                  if (_installments) ...[
                    if (periods.isEmpty)
                      const Text('Loading a complete installment schedule…'),
                    FinancialActionError(error: periodError),
                    if (cached)
                      const Text(
                        'Cached installment balances · reconnect to confirm.',
                      ),
                    if (periods.isNotEmpty)
                      DropdownButtonFormField<InstanceId>(
                        key: const Key('payment-period'),
                        initialValue: _selected,
                        isExpanded: true,
                        decoration: const InputDecoration(
                          labelText: 'Apply payment to',
                        ),
                        items: [
                          const DropdownMenuItem(
                            value: null,
                            child: Text('Earliest outstanding installments'),
                          ),
                          for (var i = 0; i < periods.length; i++)
                            if (!periods[i].closed &&
                                periods[i].remainingAmount!.minorUnits > 0)
                              DropdownMenuItem(
                                value: periods[i].id,
                                child: Text(
                                  'Installment ${i + 1} · ${periods[i].dueDate}',
                                ),
                              ),
                        ],
                        onChanged: (value) => setState(() {
                          _selected = value;
                          _amount.text = moneyEntry(_remaining);
                        }),
                      ),
                    const SizedBox(height: 12),
                    const Text(
                      'Each payment can cover up to 24 installments. For longer schedules, choose one period or enter a smaller amount.',
                    ),
                    const SizedBox(height: 18),
                  ],
                  TextFormField(
                    key: const Key('payment-amount'),
                    controller: _amount,
                    onChanged: (_) => setState(() {}),
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: InputDecoration(
                      labelText: 'Amount (${parent.currency.code})',
                    ),
                    validator: (value) =>
                        amountValidation(value, parent.currency) ??
                        (Money.parse(value!, parent.currency).minorUnits >
                                (periods.isEmpty && _installments
                                    ? 0
                                    : _remaining.minorUnits)
                            ? 'This payment exceeds the remaining balance.'
                            : null),
                  ),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton(
                      key: const Key('pay-full'),
                      onPressed: _installments && periods.isEmpty
                          ? null
                          : () => setState(
                              () => _amount.text = moneyEntry(_remaining),
                            ),
                      child: const Text('Pay full remaining amount'),
                    ),
                  ),
                  if (preview != null && entered != null) ...[
                    Text(
                      'After this payment',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    MoneyText(
                      key: const Key('payment-remaining-preview'),
                      money:
                          (parent.isRecurring
                                  ? _remaining
                                  : parent.remainingAmount!)
                              .subtract(entered),
                      includeCode: true,
                    ),
                    if (_installments) ...[
                      const SizedBox(height: 12),
                      const Text('This payment covers'),
                      for (final allocation in preview)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Wrap(
                            spacing: 12,
                            runSpacing: 5,
                            children: [
                              Text(
                                'Installment ${parent.installmentInstanceIds.indexOf(allocation.instanceId) + 1}',
                              ),
                              MoneyText(
                                money: allocation.amount,
                                includeCode: true,
                              ),
                            ],
                          ),
                        ),
                    ],
                    const SizedBox(height: 18),
                  ] else if (_installments &&
                      periods.isNotEmpty &&
                      entered != null)
                    const Padding(
                      padding: EdgeInsets.only(bottom: 18),
                      child: Text(
                        'Choose an outstanding installment or enter an amount that fits within 24 periods and their remaining balances.',
                      ),
                    ),
                  TextFormField(
                    key: const Key('payment-date'),
                    controller: _date,
                    decoration: const InputDecoration(
                      labelText: 'Payment date (YYYY-MM-DD)',
                    ),
                    validator: (value) =>
                        dateValidation(value) ??
                        (LocalDate.parse(value!.trim()).compareTo(
                                      parent.isRecurring
                                          ? widget
                                                .selectedInstance!
                                                .occurrenceDate
                                          : parent.originationDate,
                                    ) <
                                    0 ||
                                LocalDate.parse(value.trim()).compareTo(
                                      todayIn(
                                        ref.read(userProfileProvider).timezone,
                                      ),
                                    ) >
                                    0
                            ? parent.isRecurring
                                  ? 'Choose a date from this billing period’s start through today.'
                                  : 'Choose a date between the borrowed or lent date and today.'
                            : null),
                  ),
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
                        onPressed: _pickSource,
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
                      labelText: 'Notes (optional)',
                      counterText: '',
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (_pending != null && !action.isLoading) ...[
            const SizedBox(height: 12),
            const Text(
              'The save could not be confirmed. Retry the original payment to check its result. Its amount, date and installments stay the same.',
            ),
            MoneyText(money: _pending!.terms.amount, includeCode: true),
            Text('Payment date: ${_pending!.terms.date}'),
          ],
          FinancialActionError(error: _submitted ? action.error : null),
          const SizedBox(height: 12),
          FilledButton(
            key: const Key('payment-save'),
            onPressed:
                action.isLoading ||
                    (_pending == null && _installments && preview == null)
                ? null
                : _save,
            child: Text(
              action.isLoading
                  ? 'Saving…'
                  : _pending != null
                  ? 'Retry original payment'
                  : received
                  ? 'Record repayment'
                  : 'Record payment',
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
