import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/dates/local_date.dart';
import '../../../core/dates/financial_clock.dart';
import '../../../core/dates/timezone_catalog.dart';
import '../../../core/money/money.dart';
import '../../../shared/domain/financial_failure.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../obligations/domain/obligation_instance.dart';
import '../../auth/presentation/auth_providers.dart';
import '../../payments/domain/payment_commands.dart';
import '../../payments/domain/payment_entry.dart';
import '../domain/deduction_attempt.dart';
import '../domain/recurring_commands.dart';
import 'revisioned_action_form.dart';

class DeductionFailureDialog extends StatefulWidget {
  const DeductionFailureDialog({super.key, required this.instance});
  final ObligationInstance instance;
  @override
  State<DeductionFailureDialog> createState() => _DeductionFailureDialogState();
}

class _DeductionFailureDialogState extends State<DeductionFailureDialog> {
  final _reason = TextEditingController();
  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => RevisionedActionForm<DeductionFailure>(
    owner: widget.instance.owner,
    title: 'Report failed deduction',
    saveKey: const Key('deduction-save'),
    saveLabel: 'Report failed',
    fields: [
      Text('${widget.instance.title} · ${widget.instance.periodLabel}'),
      const SizedBox(height: 12),
      Text(
        widget.instance.deductionStatus == DeductionStatus.deducted ||
                widget.instance.deductionStatus == DeductionStatus.confirmed
            ? 'Tally adds a reversal for the recorded automatic payment and leaves the original payment in history. The unpaid amount becomes outstanding again.'
            : 'This leaves the bill outstanding. Record a manual payment when you pay it. Tally does not retry a bank charge.',
      ),
      const SizedBox(height: 18),
      TextFormField(
        key: const Key('deduction-reason'),
        controller: _reason,
        maxLength: 1000,
        decoration: const InputDecoration(
          labelText: 'What happened?',
          counterText: '',
        ),
        validator: (value) => (value ?? '').trim().isEmpty
            ? 'Enter a reason for the failed deduction.'
            : null,
      ),
    ],
    payload: () => DeductionFailure(
      obligationId: widget.instance.obligationId,
      instanceId: widget.instance.id,
      expectedRevision: widget.instance.revision,
      reason: _reason.text.trim(),
    ),
    submit: (actions, payload) => actions.reportDeductionFailure(payload),
  );
}

class DeductionConfirmationDialog extends ConsumerStatefulWidget {
  const DeductionConfirmationDialog({
    super.key,
    required this.instance,
    this.assumedAttempt,
  });
  final ObligationInstance instance;
  final DeductionAttempt? assumedAttempt;
  @override
  ConsumerState<DeductionConfirmationDialog> createState() =>
      _DeductionConfirmationDialogState();
}

class _DeductionConfirmationDialogState
    extends ConsumerState<DeductionConfirmationDialog> {
  late final TextEditingController _amount, _date;
  final _notes = TextEditingController();
  bool get _assumed =>
      widget.instance.deductionStatus == DeductionStatus.deducted;
  bool get _validAttempt {
    final event = widget.assumedAttempt;
    return event != null &&
        event.owner == widget.instance.owner &&
        event.instanceId == widget.instance.id &&
        event.obligationId == widget.instance.obligationId &&
        event.type == DeductionAttemptType.assumed &&
        event.amount != null &&
        event.amount!.currency == widget.instance.currency &&
        event.amount!.minorUnits > 0 &&
        event.scheduledDate != null &&
        event.paymentId != null;
  }

  @override
  void initState() {
    super.initState();
    final amount = _assumed
        ? (_validAttempt ? widget.assumedAttempt!.amount : null)
        : widget.instance.remainingAmount;
    _amount = TextEditingController(
      text: amount == null ? '' : moneyEntry(amount),
    );
    _date = TextEditingController(
      text:
          (_assumed && _validAttempt
                  ? widget.assumedAttempt!.scheduledDate
                  : widget.instance.deductionDate ??
                        widget.instance.dueDate ??
                        widget.instance.occurrenceDate)
              .toString(),
    );
  }

  @override
  void dispose() {
    _amount.dispose();
    _date.dispose();
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final period = widget.instance;
    final now = TimezoneCatalog.at(
      ref.watch(financialClockProvider),
      ref.watch(userProfileProvider).timezone,
    );
    final today = LocalDate.fromParts(now.year, now.month, now.day);
    return RevisionedActionForm<DeductionConfirmation>(
      owner: period.owner,
      title: 'Confirm deduction',
      saveKey: const Key('deduction-save'),
      saveLabel: 'Confirm deduction',
      fields: [
        Text('${period.title} · ${period.periodLabel}'),
        const SizedBox(height: 12),
        Text(
          _assumed
              ? 'Your confirmation adds evidence to the original assumed payment. Its amount, date and source stay in history. To change them, correct that payment.'
              : 'Confirm the amount that was deducted. Tally records your confirmation; it does not connect to your bank.',
        ),
        if (period.amount == null)
          const Padding(
            padding: EdgeInsets.only(top: 12),
            child: Text(
              'Enter this period’s actual bill amount before confirming a deduction.',
            ),
          ),
        if (_assumed && !_validAttempt)
          const Padding(
            padding: EdgeInsets.only(top: 12),
            child: Text(
              'Load the original deduction record before confirming.',
            ),
          ),
        const SizedBox(height: 18),
        TextFormField(
          key: const Key('deduction-amount'),
          controller: _amount,
          readOnly: _assumed,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            labelText: 'Deducted amount (${period.currency.code})',
          ),
          validator: (value) =>
              amountValidation(value, period.currency) ??
              (Money.parse(value!, period.currency).minorUnits <= 0
                  ? 'Enter an amount greater than zero.'
                  : !_assumed &&
                        Money.parse(value, period.currency).minorUnits >
                            (period.remainingAmount?.minorUnits ?? 0)
                  ? 'This exceeds the period’s remaining balance.'
                  : null),
        ),
        const SizedBox(height: 18),
        TextFormField(
          key: const Key('deduction-date'),
          controller: _date,
          readOnly: _assumed,
          decoration: const InputDecoration(
            labelText: 'Deduction date (YYYY-MM-DD)',
          ),
          validator: (value) =>
              dateValidation(value) ??
              (LocalDate.parse(value!.trim()).compareTo(period.occurrenceDate) <
                      0
                  ? 'Confirm a date on or after the period starts.'
                  : LocalDate.parse(value.trim()).compareTo(today) > 0
                  ? 'Confirm a date on or before today in your profile timezone.'
                  : null),
        ),
        const SizedBox(height: 12),
        Text(
          'Payment source: ${(_assumed ? widget.assumedAttempt?.source : period.source)?.name ?? 'No source selected'}',
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
      payload: () {
        if (period.amount == null || _assumed && !_validAttempt) {
          throw const FinancialFailure(
            FinancialFailureCode.invalid,
            'Review the bill amount and original deduction first.',
          );
        }
        return DeductionConfirmation(
          obligationId: period.obligationId,
          instanceId: period.id,
          expectedRevision: period.revision,
          terms: PaymentTerms(
            amount: Money.parse(_amount.text, period.currency),
            date: LocalDate.parse(_date.text.trim()),
            sourceId: _assumed
                ? widget.assumedAttempt!.sourceId
                : period.paymentSourceId,
            method: PaymentMethod.other,
            notes: _notes.text.trim(),
          ),
        );
      },
      submit: (actions, payload) => actions.confirmDeduction(payload),
    );
  }
}
