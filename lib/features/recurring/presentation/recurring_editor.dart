import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../../../core/money/money.dart';
import '../../../shared/domain/catalog.dart';
import '../../../shared/domain/financial_failure.dart';
import '../../../shared/presentation/financial_actions.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/presentation/financial_providers.dart';
import '../../../shared/widgets/catalog_picker.dart';
import '../../../shared/widgets/page_body.dart';
import '../../auth/presentation/auth_providers.dart';
import '../../obligations/domain/obligation.dart';
import '../domain/recurring_commands.dart';
import 'recurrence_editor.dart';

String paymentModeLabel(PaymentMode mode) => switch (mode) {
  PaymentMode.manual => 'Manual',
  PaymentMode.automatic => 'Automatic',
  PaymentMode.automaticConfirmation => 'Automatic with confirmation',
};

class RecurringEditor extends ConsumerStatefulWidget {
  const RecurringEditor({
    super.key,
    this.initial,
    this.automatic = false,
    this.onSaved,
  });
  final Obligation? initial;
  final bool automatic;
  final ValueChanged<RecurringResult>? onSaved;
  @override
  ConsumerState<RecurringEditor> createState() => _RecurringEditorState();
}

class _RecurringEditorState extends ConsumerState<RecurringEditor> {
  final _form = GlobalKey<FormState>();
  final _schedule = GlobalKey<RecurrenceEditorState>();
  late final OwnerUid _owner;
  late final Obligation? _base;
  late final TextEditingController _title,
      _amount,
      _description,
      _notes,
      _offsets,
      _reminderTime;
  late CurrencyCode _currency;
  late AmountKind _kind;
  late PaymentMode _mode;
  late bool _reminders;
  ContactId? _contact;
  SourceId? _source;
  late CategoryId _category;
  String _contactName = 'No person or organization selected',
      _sourceName = 'No payment source',
      _categoryName = 'Other';
  RecurringDraft? _pending;
  bool _submitted = false, _conflict = false;
  Object? _validationError;
  @override
  void initState() {
    super.initState();
    _base = widget.initial;
    _owner = ref.read(ownerUidProvider);
    final profile = ref.read(userProfileProvider);
    _currency = _base?.currency ?? profile.defaultCurrency;
    _kind = _base?.amountKind ?? AmountKind.fixed;
    _mode =
        _base?.paymentMode ??
        (widget.automatic
            ? PaymentMode.automaticConfirmation
            : PaymentMode.manual);
    _title = TextEditingController(text: _base?.title);
    _amount = TextEditingController(
      text: _base?.defaultAmount == null
          ? ''
          : moneyEntry(_base!.defaultAmount!),
    );
    _description = TextEditingController(text: _base?.description);
    _notes = TextEditingController(text: _base?.notes);
    _contact = _base?.contactId;
    _source = _base?.paymentSourceId;
    _category = _base?.categoryId ?? CategoryId('default-other');
    _contactName = _base?.contact?.name ?? _contactName;
    _sourceName = _base?.source?.name ?? _sourceName;
    _categoryName = _base?.categoryName ?? _categoryName;
    _reminders = _base?.reminderPolicy?.enabled ?? true;
    _offsets = TextEditingController(
      text: (_base?.reminderPolicy?.offsetDays ?? [0, 3]).join(', '),
    );
    _reminderTime = TextEditingController(
      text: _base?.reminderPolicy?.localTime ?? '09:00',
    );
  }

  @override
  void dispose() {
    for (final controller in [
      _title,
      _amount,
      _description,
      _notes,
      _offsets,
      _reminderTime,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _pickContact() async {
    final catalog = ref.read(catalogRepositoryProvider);
    final choice = await pickCatalog<Contact>(
      context,
      title: 'Choose a person or organization',
      stream: catalog.watchContacts(),
      more: (cursor) => catalog.getContacts(after: cursor),
      label: (value) => value.name,
      active: (value) => !value.archived,
    );
    if (mounted && choice != null) {
      setState(() {
        _contact = choice.id;
        _contactName = choice.name;
      });
    }
  }

  Future<void> _pickSource() async {
    final catalog = ref.read(catalogRepositoryProvider);
    final choice = await pickCatalog<PaymentSource>(
      context,
      title: 'Choose a payment source',
      stream: catalog.watchSources(),
      more: (cursor) => catalog.getSources(after: cursor),
      label: (value) => value.name,
      active: (value) => value.active,
    );
    if (mounted && choice != null) {
      setState(() {
        _source = choice.id;
        _sourceName = choice.name;
      });
    }
  }

  Future<void> _pickCategory() async {
    final catalog = ref.read(catalogRepositoryProvider);
    final choice = await pickCatalog<Category>(
      context,
      title: 'Choose a category',
      stream: catalog.watchCategories(),
      more: (cursor) => catalog.getCategories(after: cursor),
      label: (value) => value.name,
      active: (value) => value.active,
    );
    if (mounted && choice != null) {
      setState(() {
        _category = choice.id;
        _categoryName = choice.name;
      });
    }
  }

  ReminderPolicy _reminder() => ReminderPolicy(
    enabled: _reminders,
    offsetDays: _offsets.text.trim().isEmpty
        ? []
        : _offsets.text
              .split(',')
              .map((value) => int.parse(value.trim()))
              .toList(),
    localTime: _reminderTime.text.trim(),
  );
  Future<void> _save() async {
    if (ref.read(ownerUidProvider) != _owner || _conflict) return;
    if (_pending == null) {
      if (!_form.currentState!.validate()) return;
      try {
        _pending = RecurringDraft(
          title: _title.text.trim(),
          description: _description.text.trim(),
          notes: _notes.text.trim(),
          currency: _currency,
          amountKind: _kind,
          defaultAmount: _amount.text.trim().isEmpty
              ? null
              : Money.parse(_amount.text, _currency),
          paymentMode: _mode,
          contactId: _contact,
          categoryId: _category,
          paymentSourceId: _source,
          recurrence: _schedule.currentState!.value(),
          reminderPolicy: _reminder(),
        );
      } catch (error) {
        setState(() => _validationError = error);
        return;
      }
    }
    setState(() {
      _submitted = true;
      _validationError = null;
    });
    final actions = ref.read(financialActionsProvider.notifier);
    final saved = _base == null
        ? await actions.createRecurring(_pending!)
        : await actions.editRecurring(
            RecurringEdit(
              obligationId: _base.id,
              expectedRevision: _base.revision,
              draft: _pending!,
            ),
          );
    if (!mounted || ref.read(ownerUidProvider) != _owner) return;
    if (saved != null) {
      if (widget.onSaved != null) {
        widget.onSaved!(saved);
      } else {
        context.go('/obligations/${saved.obligationId.value}');
      }
      return;
    }
    final error = ref.read(financialActionsProvider).error;
    final uncertain =
        error is FinancialFailure &&
        (error.code == FinancialFailureCode.offline ||
            error.code == FinancialFailureCode.unavailable);
    setState(() {
      if (!uncertain) _pending = null;
      _conflict =
          error is FinancialFailure &&
          error.code == FinancialFailureCode.conflict;
    });
  }

  @override
  Widget build(BuildContext context) {
    final action = ref.watch(financialActionsProvider),
        profile = ref.watch(userProfileProvider);
    final changedOwner = ref.watch(ownerUidProvider) != _owner;
    final frozen =
        action.isLoading || _pending != null || _conflict || changedOwner;
    return PopScope(
      canPop: !action.isLoading,
      child: PageBody(
        title: _base == null ? 'Add monthly due' : 'Edit recurring bill',
        subtitle: 'One bill, a clear history for every period.',
        child: Align(
          alignment: Alignment.topLeft,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: Form(
              key: _form,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(22),
                      child: ExcludeFocus(
                        excluding: frozen,
                        child: AbsorbPointer(
                          absorbing: frozen,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              if (_base != null) ...[
                                Text(
                                  _base.recurrence?.generatedThrough == null
                                      ? 'Changes apply to newly generated periods.'
                                      : 'Changes apply after ${_base.recurrence!.generatedThrough}. Existing periods keep their amounts, source, dates and payment behavior.',
                                ),
                                const SizedBox(height: 20),
                              ],
                              TextFormField(
                                key: const Key('recurring-title'),
                                controller: _title,
                                maxLength: 120,
                                decoration: const InputDecoration(
                                  labelText: 'Bill name',
                                  counterText: '',
                                  hintText: 'Internet, rent, Netflix…',
                                ),
                                validator: requiredText,
                              ),
                              const SizedBox(height: 18),
                              DropdownButtonFormField<CurrencyCode>(
                                key: const Key('recurring-currency'),
                                initialValue: _currency,
                                isExpanded: true,
                                decoration: const InputDecoration(
                                  labelText: 'Currency',
                                ),
                                items: [
                                  for (final value in CurrencyCode.values)
                                    DropdownMenuItem(
                                      value: value,
                                      child: Text(
                                        '${value.code} · ${value.symbol}',
                                      ),
                                    ),
                                ],
                                onChanged:
                                    _base?.recurrence?.generatedThrough != null
                                    ? null
                                    : (value) =>
                                          setState(() => _currency = value!),
                              ),
                              const SizedBox(height: 18),
                              DropdownButtonFormField<AmountKind>(
                                key: const Key('recurring-kind'),
                                initialValue: _kind,
                                isExpanded: true,
                                decoration: const InputDecoration(
                                  labelText: 'Amount behavior',
                                ),
                                items: const [
                                  DropdownMenuItem(
                                    value: AmountKind.fixed,
                                    child: Text('Fixed amount'),
                                  ),
                                  DropdownMenuItem(
                                    value: AmountKind.variable,
                                    child: Text('Variable amount'),
                                  ),
                                ],
                                onChanged: (value) =>
                                    setState(() => _kind = value!),
                              ),
                              const SizedBox(height: 18),
                              TextFormField(
                                key: const Key('recurring-amount'),
                                controller: _amount,
                                keyboardType:
                                    const TextInputType.numberWithOptions(
                                      decimal: true,
                                    ),
                                decoration: InputDecoration(
                                  labelText: _kind == AmountKind.fixed
                                      ? 'Amount (${_currency.code})'
                                      : 'Estimated amount (optional, ${_currency.code})',
                                ),
                                validator: (value) =>
                                    _kind == AmountKind.variable &&
                                        (value ?? '').trim().isEmpty
                                    ? null
                                    : amountValidation(value, _currency) ??
                                          (Money.parse(
                                                    value!,
                                                    _currency,
                                                  ).minorUnits ==
                                                  0
                                              ? 'Enter an amount greater than zero.'
                                              : null),
                              ),
                              if (_kind == AmountKind.variable)
                                const Padding(
                                  padding: EdgeInsets.only(top: 8),
                                  child: Text(
                                    'Enter the actual amount separately for each billing period. An estimate does not count as money due.',
                                  ),
                                ),
                              const SizedBox(height: 18),
                              DropdownButtonFormField<PaymentMode>(
                                key: const Key('recurring-mode'),
                                initialValue: _mode,
                                isExpanded: true,
                                decoration: const InputDecoration(
                                  labelText: 'Payment behavior',
                                ),
                                items: [
                                  for (final value in PaymentMode.values)
                                    DropdownMenuItem(
                                      value: value,
                                      child: Text(paymentModeLabel(value)),
                                    ),
                                ],
                                onChanged: (value) =>
                                    setState(() => _mode = value!),
                              ),
                              const SizedBox(height: 10),
                              Text(switch (_mode) {
                                PaymentMode.automatic => 'Tally will record this as paid on its schedule. You can correct it if the deduction fails.',
                                PaymentMode.automaticConfirmation => 'Tally will remind you to confirm whether the deduction happened. It stays outstanding until you confirm or record a payment.',
                                PaymentMode.manual => 'Record a full or partial payment when you pay this bill.',
                              }),
                              const SizedBox(height: 18),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  OutlinedButton(
                                    onPressed: _pickContact,
                                    child: Text(_contactName),
                                  ),
                                  if (_contact != null)
                                    TextButton(
                                      onPressed: () => setState(() {
                                        _contact = null;
                                        _contactName = 'No person or organization selected';
                                      }),
                                      child: const Text('Clear person'),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 10),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  OutlinedButton(
                                    onPressed: _pickSource,
                                    child: Text(_sourceName),
                                  ),
                                  if (_source != null)
                                    TextButton(
                                      onPressed: () => setState(() {
                                        _source = null;
                                        _sourceName = 'No payment source';
                                      }),
                                      child: const Text('Clear source'),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 10),
                              Align(
                                alignment: Alignment.centerLeft,
                                child: OutlinedButton(
                                  onPressed: _pickCategory,
                                  child: Text('Category: $_categoryName'),
                                ),
                              ),
                              const SizedBox(height: 24),
                              const Divider(),
                              const SizedBox(height: 20),
                              RecurrenceEditor(
                                key: _schedule,
                                timezone: _base?.timezone ?? profile.timezone,
                                startDate:
                                    _base?.recurrence?.generatedThrough ??
                                    todayIn(profile.timezone),
                                initial: _base?.recurrence?.rule,
                              ),
                              const SizedBox(height: 24),
                              const Divider(),
                              const SizedBox(height: 14),
                              SwitchListTile(
                                contentPadding: EdgeInsets.zero,
                                title: const Text('Remind me'),
                                value: _reminders,
                                onChanged: (value) =>
                                    setState(() => _reminders = value),
                              ),
                              TextFormField(
                                controller: _offsets,
                                decoration: const InputDecoration(
                                  labelText: 'Days before due date',
                                  helperText: '0 = on the due date. Example: 0, 1, 3, 7',
                                ),
                                validator: (_) {
                                  try {
                                    _reminder();
                                    return null;
                                  } catch (_) {
                                    return 'Choose up to 8 different days from 0 to 365, separated by commas.';
                                  }
                                },
                              ),
                              const SizedBox(height: 18),
                              TextFormField(
                                controller: _reminderTime,
                                decoration: const InputDecoration(
                                  labelText: 'Reminder time (HH:mm)',
                                ),
                                validator: (value) =>
                                    RegExp(r'^(?:[01]\d|2[0-3]):[0-5]\d$')
                                        .hasMatch((value ?? '').trim())
                                    ? null
                                    : 'Use 00:00 to 23:59.',
                              ),
                              const SizedBox(height: 18),
                              TextFormField(
                                controller: _description,
                                maxLength: 1000,
                                decoration: const InputDecoration(
                                  labelText: 'Description (optional)',
                                  counterText: '',
                                ),
                              ),
                              const SizedBox(height: 18),
                              TextFormField(
                                controller: _notes,
                                maxLength: 4000,
                                minLines: 2,
                                maxLines: 5,
                                decoration: const InputDecoration(
                                  labelText: 'Notes (optional)',
                                  counterText: '',
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  if (_pending != null && !action.isLoading)
                    const Padding(
                      padding: EdgeInsets.only(top: 16),
                      child: Text(
                        'The save could not be confirmed. Retry the original action with its unchanged values.',
                      ),
                    ),
                  if (_conflict)
                    const Text(
                      'This bill changed. Reopen the editor with the latest record.',
                    ),
                  if (changedOwner)
                    const Text('Account changed. Reopen this form.'),
                  FinancialActionError(
                    error:
                        _validationError ?? (_submitted ? action.error : null),
                  ),
                  const SizedBox(height: 20),
                  FilledButton(
                    key: const Key('recurring-save'),
                    onPressed: action.isLoading || _conflict || changedOwner
                        ? null
                        : _save,
                    child: Text(
                      action.isLoading
                          ? 'Saving…'
                          : _pending != null
                          ? 'Retry original action'
                          : _base == null
                          ? 'Add monthly due'
                          : 'Save future schedule',
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
