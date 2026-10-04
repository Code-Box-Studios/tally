import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/dates/local_date.dart';
import '../../../core/money/money.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/catalog.dart';
import '../../../shared/presentation/financial_actions.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/presentation/financial_providers.dart';
import '../../../shared/widgets/catalog_picker.dart';
import '../../../shared/widgets/financial_labels.dart';
import '../../auth/presentation/auth_providers.dart';
import '../../obligations/domain/obligation.dart';
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
    if (!_form.currentState!.validate()) return;
    setState(() => _submitted = true);
    final result = await ref
        .read(financialActionsProvider.notifier)
        .correctPayment(
          PaymentCorrection(
            paymentId: widget.original.id,
            reason: _reason.text.trim(),
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
          ),
        );
    if (mounted && result != null) Navigator.pop(context, result);
  }

  @override
  Widget build(BuildContext context) {
    final action = ref.watch(financialActionsProvider);
    return Form(
      key: _form,
      child: FinancialDialogBody(
        title: 'Correct payment',
        children: [
          const Text(
            'The original payment stays in history. Tally adds a reversal and, if selected, a replacement in one save.',
          ),
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
              decoration: InputDecoration(
                labelText:
                    'Corrected amount (${widget.original.amount.currency.code})',
              ),
              validator: (value) =>
                  amountValidation(value, widget.original.amount.currency) ??
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
                  (LocalDate.parse(
                                value!.trim(),
                              ).compareTo(widget.obligation.originationDate) <
                              0 ||
                          LocalDate.parse(value.trim()).compareTo(
                                todayIn(ref.read(userProfileProvider).timezone),
                              ) >
                              0
                      ? 'Choose a date between the borrowed or lent date and today.'
                      : null),
            ),
            const SizedBox(height: 18),
            DropdownButtonFormField<PaymentMethod>(
              initialValue: _method,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Payment method'),
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
          FinancialActionError(error: _submitted ? action.error : null),
          const SizedBox(height: 12),
          FilledButton(
            key: const Key('correction-save'),
            onPressed: action.isLoading ? null : _save,
            child: Text(action.isLoading ? 'Saving…' : 'Save correction'),
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
