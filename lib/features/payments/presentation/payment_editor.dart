import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/dates/local_date.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/money.dart';
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

class PaymentEditor extends ConsumerStatefulWidget {
  const PaymentEditor({super.key, required this.obligation});
  final Obligation obligation;
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
  @override
  void initState() {
    super.initState();
    _amount = TextEditingController(
      text: moneyEntry(widget.obligation.remainingAmount!),
    );
    _date = TextEditingController(
      text: todayIn(ref.read(userProfileProvider).timezone).toString(),
    );
    _notes = TextEditingController();
    _source = widget.obligation.paymentSourceId;
    _sourceName = widget.obligation.source?.name ?? _sourceName;
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
    if (!_form.currentState!.validate()) return;
    setState(() => _submitted = true);
    final result = await ref
        .read(financialActionsProvider.notifier)
        .recordPayment(
          PaymentDraft(
            obligationId: widget.obligation.id,
            instanceId: widget.obligation.singleInstanceId!,
            terms: PaymentTerms(
              amount: Money.parse(_amount.text, widget.obligation.currency),
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
    final parent = widget.obligation;
    final received = parent.direction == ObligationDirection.owedToMe;
    return Form(
      key: _form,
      child: FinancialDialogBody(
        title: received ? 'Record repayment' : 'Record payment',
        children: [
          Text(parent.title),
          const SizedBox(height: 6),
          const Text(
            'Record a full, partial or custom amount. Each payment keeps its own history.',
          ),
          const SizedBox(height: 20),
          TextFormField(
            key: const Key('payment-amount'),
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: 'Amount (${parent.currency.code})',
            ),
            validator: (value) =>
                amountValidation(value, parent.currency) ??
                (Money.parse(value!, parent.currency).minorUnits >
                        parent.remainingAmount!.minorUnits
                    ? 'This payment exceeds the remaining balance.'
                    : null),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              key: const Key('pay-full'),
              onPressed: () => setState(
                () => _amount.text = moneyEntry(parent.remainingAmount!),
              ),
              child: const Text('Pay full remaining amount'),
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
                (LocalDate.parse(value!.trim())
                                .compareTo(parent.originationDate) <
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
            decoration: const InputDecoration(
              labelText: 'Notes (optional)',
              counterText: '',
            ),
          ),
          FinancialActionError(error: _submitted ? action.error : null),
          const SizedBox(height: 12),
          FilledButton(
            key: const Key('payment-save'),
            onPressed: action.isLoading ? null : _save,
            child: Text(
              action.isLoading
                  ? 'Saving…'
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
