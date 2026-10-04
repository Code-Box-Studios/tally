import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/dates/local_date.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../../../core/money/money.dart';
import '../../../shared/domain/catalog.dart';
import '../../../shared/presentation/catalog_editor.dart';
import '../../../shared/presentation/financial_actions.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/presentation/financial_providers.dart';
import '../../../shared/widgets/catalog_picker.dart';
import '../../../shared/widgets/page_body.dart';
import '../../auth/presentation/auth_providers.dart';
import '../domain/obligation.dart';
import '../domain/obligation_commands.dart';

class ObligationEditor extends ConsumerStatefulWidget {
  const ObligationEditor({
    super.key,
    this.initial,
    this.direction = ObligationDirection.owedByMe,
    this.onSaved,
  });
  final Obligation? initial;
  final ObligationDirection direction;
  final ValueChanged<ObligationResult>? onSaved;
  @override
  ConsumerState<ObligationEditor> createState() => _ObligationEditorState();
}

class _ObligationEditorState extends ConsumerState<ObligationEditor> {
  final _form = GlobalKey<FormState>();
  late final Obligation? _base;
  late final TextEditingController _title,
      _amount,
      _date,
      _due,
      _description,
      _notes,
      _rate,
      _basis,
      _agreement;
  late CurrencyCode _currency;
  late ObligationDirection _direction;
  ContactId? _contact;
  SourceId? _source;
  late CategoryId _category;
  String _contactName = 'No person selected',
      _sourceName = 'No default source',
      _categoryName = 'Personal Loan';
  bool _interest = false, _submitted = false;
  @override
  void initState() {
    super.initState();
    _base = widget.initial;
    final profile = ref.read(userProfileProvider);
    _currency = _base?.currency ?? profile.defaultCurrency;
    _direction = _base?.direction ?? widget.direction;
    _title = TextEditingController(text: _base?.title);
    _amount = TextEditingController(
      text: _base?.originalAmount == null
          ? ''
          : moneyEntry(_base!.originalAmount!),
    );
    _date = TextEditingController(
      text: (_base?.originationDate ?? todayIn(profile.timezone)).toString(),
    );
    _due = TextEditingController(text: _base?.dueDate?.toString());
    _description = TextEditingController(text: _base?.description);
    _notes = TextEditingController(text: _base?.notes);
    _rate = TextEditingController(
      text: _base?.interestInfo?.rateBasisPoints.toString(),
    );
    _basis = TextEditingController(text: _base?.interestInfo?.basis);
    _agreement = TextEditingController(text: _base?.interestInfo?.notes);
    _interest = _base?.interestInfo != null;
    _contact = _base?.contactId;
    _source = _base?.paymentSourceId;
    _category = _base?.categoryId ?? CategoryId('default-personal-loan');
    _contactName = _base?.contact?.name ?? _contactName;
    _sourceName = _base?.source?.name ?? _sourceName;
    _categoryName = _base?.categoryName ?? _categoryName;
  }

  @override
  void dispose() {
    for (final controller in [
      _title,
      _amount,
      _date,
      _due,
      _description,
      _notes,
      _rate,
      _basis,
      _agreement,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  bool get _locked => _base?.hasPaymentHistory == true;
  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _submitted = true);
    final draft = ObligationDraft(
      title: _title.text.trim(),
      description: _description.text.trim(),
      notes: _notes.text.trim(),
      direction: _direction,
      amount: Money.parse(_amount.text, _currency),
      originationDate: LocalDate.parse(_date.text.trim()),
      dueDate: _due.text.trim().isEmpty
          ? null
          : LocalDate.parse(_due.text.trim()),
      contactId: _contact,
      categoryId: _category,
      paymentSourceId: _source,
      interestInfo: !_interest
          ? null
          : InterestInfo(
              rateBasisPoints: int.parse(_rate.text),
              basis: _basis.text.trim(),
              notes: _agreement.text.trim(),
            ),
    );
    final actions = ref.read(financialActionsProvider.notifier);
    final saved = _base == null
        ? await actions.createObligation(draft)
        : await actions.editObligation(_base.id, _base.revision, draft);
    if (!mounted || saved == null) return;
    if (widget.onSaved != null) {
      widget.onSaved!(saved);
    } else {
      context.go('/obligations/${saved.id.value}');
    }
  }

  Future<void> _pickContact() async {
    if (ref.read(financialActionsProvider).isLoading) return;
    final catalog = ref.read(catalogRepositoryProvider);
    final selected = await pickCatalog<Contact>(
      context,
      title: 'Choose a person or organization',
      stream: catalog.watchContacts(),
      more: (cursor) => catalog.getContacts(after: cursor),
      label: (value) => value.name,
      active: (value) => !value.archived,
    );
    if (mounted && selected != null) {
      setState(() {
        _contact = selected.id;
        _contactName = selected.name;
      });
    }
  }

  Future<void> _addContact() async {
    if (ref.read(financialActionsProvider).isLoading) return;
    final selected = await showFinancialDialog<CatalogEditorResult>(
      context,
      const CatalogEditor(kind: CatalogEditorKind.contact),
    );
    if (mounted && selected?.contactId != null) {
      setState(() {
        _contact = selected!.contactId;
        _contactName = selected.name;
      });
    }
  }

  Future<void> _pickCategory() async {
    if (ref.read(financialActionsProvider).isLoading) return;
    final catalog = ref.read(catalogRepositoryProvider);
    final selected = await pickCatalog<Category>(
      context,
      title: 'Choose a category',
      stream: catalog.watchCategories(),
      more: (cursor) => catalog.getCategories(after: cursor),
      label: (value) => value.name,
      active: (value) => value.active,
    );
    if (mounted && selected != null) {
      setState(() {
        _category = selected.id;
        _categoryName = selected.name;
      });
    }
  }

  Future<void> _pickSource() async {
    if (ref.read(financialActionsProvider).isLoading) return;
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

  Widget _field(
    TextEditingController controller,
    String key,
    String label, {
    bool enabled = true,
    int? max,
    String? Function(String?)? validate,
    TextInputType? keyboard,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 18),
    child: TextFormField(
      key: Key(key),
      controller: controller,
      enabled: enabled,
      maxLength: max,
      keyboardType: keyboard,
      decoration: InputDecoration(labelText: label, counterText: ''),
      validator: validate,
    ),
  );
  @override
  Widget build(BuildContext context) {
    final action = ref.watch(financialActionsProvider);
    final borrowed = _direction == ObligationDirection.owedByMe;
    return PageBody(
      title: _base == null
          ? (borrowed ? 'I borrowed money' : 'I lent money')
          : 'Edit obligation',
      subtitle: borrowed
          ? 'Keep track of what you owe, one payment at a time.'
          : 'Remember what’s owed to you and each repayment.',
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Form(
                key: _form,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (_locked)
                      const Padding(
                        padding: EdgeInsets.only(bottom: 18),
                        child: Text(
                          'Payment history preserves the original amount, currency, date and person.',
                        ),
                      ),
                    if (_base != null &&
                        widget.initial?.revision != _base.revision)
                      const Padding(
                        padding: EdgeInsets.only(bottom: 18),
                        child: Text(
                          'This obligation changed elsewhere. Your draft keeps its original version; refresh before saving.',
                        ),
                      ),
                    _field(
                      _title,
                      'obligation-title',
                      'What is this for?',
                      max: 120,
                      validate: requiredText,
                    ),
                    DropdownButtonFormField<CurrencyCode>(
                      initialValue: _currency,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Currency'),
                      items: [
                        for (final currency in CurrencyCode.values)
                          DropdownMenuItem(
                            value: currency,
                            child: Text(currency.code),
                          ),
                      ],
                      onChanged: _locked
                          ? null
                          : (value) => setState(() => _currency = value!),
                    ),
                    const SizedBox(height: 18),
                    _field(
                      _amount,
                      'obligation-amount',
                      'Original amount',
                      enabled: !_locked,
                      keyboard: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      validate: (value) => amountValidation(value, _currency),
                    ),
                    _field(
                      _date,
                      'obligation-date',
                      borrowed
                          ? 'Date borrowed (YYYY-MM-DD)'
                          : 'Date lent (YYYY-MM-DD)',
                      enabled: !_locked,
                      validate: (value) =>
                          dateValidation(value) ??
                          (LocalDate.parse(value!.trim()).compareTo(
                                    todayIn(
                                      ref.read(userProfileProvider).timezone,
                                    ),
                                  ) >
                                  0
                              ? 'Choose today or an earlier date.'
                              : null),
                    ),
                    _field(
                      _due,
                      'obligation-due',
                      'Due date (optional, YYYY-MM-DD)',
                      enabled: _base?.status != FinancialStatus.paid,
                      validate: (value) {
                        final invalid = dateValidation(value, optional: true);
                        if (invalid != null || (value ?? '').trim().isEmpty) {
                          return invalid;
                        }
                        if (dateValidation(_date.text) != null) return null;
                        return LocalDate.parse(value!.trim()).compareTo(
                                  LocalDate.parse(_date.text.trim()),
                                ) <
                                0
                            ? 'Due date cannot be before the borrowed or lent date.'
                            : null;
                      },
                    ),
                    Text(
                      'Person or organization',
                      style: Theme.of(context).textTheme.labelLarge,
                    ),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        OutlinedButton.icon(
                          onPressed: _locked ? null : _pickContact,
                          icon: const Icon(Icons.person_outline),
                          label: Text(_contactName),
                        ),
                        if (!_locked)
                          TextButton.icon(
                            onPressed: _addContact,
                            icon: const Icon(Icons.add),
                            label: const Text('Add new'),
                          ),
                        if (!_locked && _contact != null)
                          TextButton(
                            onPressed: () => setState(() {
                              _contact = null;
                              _contactName = 'No person selected';
                            }),
                            child: const Text('Clear'),
                          ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'Category',
                      style: Theme.of(context).textTheme.labelLarge,
                    ),
                    OutlinedButton(
                      onPressed: _pickCategory,
                      child: Text(_categoryName),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'Default payment source',
                      style: Theme.of(context).textTheme.labelLarge,
                    ),
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
                              _sourceName = 'No default source';
                            }),
                            child: const Text('Clear'),
                          ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    _field(
                      _description,
                      'obligation-description',
                      'Description (optional)',
                      max: 1000,
                    ),
                    _field(
                      _notes,
                      'obligation-notes',
                      'Notes (optional)',
                      max: 4000,
                    ),
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Add interest information'),
                      subtitle: const Text(
                        'For reference. This does not add interest to the balance.',
                      ),
                      value: _interest,
                      onChanged: (value) => setState(() => _interest = value!),
                    ),
                    if (_interest) ...[
                      _field(
                        _rate,
                        'interest-rate',
                        'Rate in basis points (100 = 1%)',
                        keyboard: TextInputType.number,
                        validate: (value) {
                          final number = int.tryParse(value ?? '');
                          return number == null || number < 0 || number > 100000
                              ? 'Enter a whole number from 0 to 100000.'
                              : null;
                        },
                      ),
                      _field(
                        _basis,
                        'interest-basis',
                        'Interest basis',
                        max: 80,
                        validate: requiredText,
                      ),
                      _field(
                        _agreement,
                        'interest-notes',
                        'Agreement notes',
                        max: 2000,
                      ),
                    ],
                    FinancialActionError(
                      error: _submitted ? action.error : null,
                    ),
                    FilledButton(
                      key: const Key('obligation-save'),
                      onPressed: action.isLoading ? null : _save,
                      child: Text(
                        action.isLoading ? 'Saving…' : 'Save obligation',
                      ),
                    ),
                    if (widget.onSaved == null)
                      TextButton(
                        onPressed: action.isLoading
                            ? null
                            : () => context.go(
                                _base == null
                                    ? '/obligations'
                                    : '/obligations/${_base.id.value}',
                              ),
                        child: const Text('Cancel'),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
