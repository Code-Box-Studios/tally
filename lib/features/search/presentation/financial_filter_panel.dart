import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/dates/local_date.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../../../core/money/money.dart';
import '../../../shared/domain/catalog.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/presentation/financial_providers.dart';
import '../../../shared/widgets/catalog_picker.dart';
import '../../obligations/domain/obligation.dart';
import '../domain/financial_filter.dart';

FinancialFilter filterWithText(FinancialFilter filter, String text) =>
    FinancialFilter(
      section: filter.section,
      status: filter.status,
      currency: filter.currency,
      contactId: filter.contactId,
      categoryId: filter.categoryId,
      sourceId: filter.sourceId,
      paymentMode: filter.paymentMode,
      automaticOnly: filter.automaticOnly,
      minimumMinor: filter.minimumMinor,
      maximumMinor: filter.maximumMinor,
      firstDate: filter.firstDate,
      lastDate: filter.lastDate,
      lifecycle: filter.lifecycle,
      text: text,
    );

String recordStatusLabel(RecordStatus status) => switch (status) {
  RecordStatus.all => 'All statuses',
  RecordStatus.pending => 'Pending',
  RecordStatus.partiallyPaid => 'Partially paid',
  RecordStatus.paid => 'Paid',
  RecordStatus.overdue => 'Overdue',
  RecordStatus.skipped => 'Skipped',
  RecordStatus.cancelled => 'Cancelled',
};

Future<FinancialFilter?> showFinancialFilters(
  BuildContext context,
  FinancialFilter current, {
  bool showSection = true,
  bool allowPeriodState = true,
  bool allowLifecycle = false,
}) => showFinancialDialog<FinancialFilter>(
  context,
  FinancialDialogBody(
    guardSubmission: false,
    title: 'Filter obligations',
    children: [
      FinancialFilterPanel(
        initial: current,
        showSection: showSection,
        allowPeriodState: allowPeriodState,
        allowLifecycle: allowLifecycle,
        onApply: (filter) => Navigator.pop(context, filter),
      ),
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
    ],
  ),
  guardSubmission: false,
);

class FinancialFilterPanel extends ConsumerStatefulWidget {
  const FinancialFilterPanel({
    super.key,
    required this.initial,
    required this.onApply,
    this.showSection = true,
    this.allowPeriodState = true,
    this.allowLifecycle = false,
  });
  final FinancialFilter initial;
  final ValueChanged<FinancialFilter> onApply;
  final bool showSection, allowPeriodState, allowLifecycle;
  @override
  ConsumerState<FinancialFilterPanel> createState() =>
      _FinancialFilterPanelState();
}

class _FinancialFilterPanelState extends ConsumerState<FinancialFilterPanel> {
  final _form = GlobalKey<FormState>();
  late ObligationSection? _section = widget.initial.section;
  late RecordStatus _status = widget.initial.status;
  late CurrencyCode? _currency = widget.initial.currency;
  late ContactId? _contact = widget.initial.contactId;
  late CategoryId? _category = widget.initial.categoryId;
  late SourceId? _source = widget.initial.sourceId;
  String? _contactName, _categoryName, _sourceName;
  late String _mode = widget.initial.automaticOnly
      ? 'automaticOnly'
      : widget.initial.paymentMode?.name ?? 'all';
  late ObligationLifecycle? _lifecycle = widget.initial.lifecycle;
  late final _minimum = TextEditingController(
    text: _entry(widget.initial.minimumMinor),
  );
  late final _maximum = TextEditingController(
    text: _entry(widget.initial.maximumMinor),
  );
  late final _first = TextEditingController(
    text: widget.initial.firstDate?.toString() ?? '',
  );
  late final _last = TextEditingController(
    text: widget.initial.lastDate?.toString() ?? '',
  );
  String? _error;
  String _entry(int? value) => value == null || _currency == null
      ? ''
      : moneyEntry(Money.fromMinorUnits(value, _currency!));
  @override
  void dispose() {
    _minimum.dispose();
    _maximum.dispose();
    _first.dispose();
    _last.dispose();
    super.dispose();
  }

  int? _amount(String value) => value.trim().isEmpty
      ? null
      : Money.parse(value, _currency!, allowZero: true).minorUnits;
  LocalDate? _date(String value) =>
      value.trim().isEmpty ? null : LocalDate.parse(value.trim());
  String? _amountValidation(String? value) {
    if ((value ?? '').trim().isEmpty || _currency == null) return null;
    try {
      Money.parse(value!, _currency!, allowZero: true);
      return null;
    } catch (_) {
      return 'Enter a valid amount for ${_currency!.code}.';
    }
  }

  void _apply() {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    final min = _amount(_minimum.text),
        max = _amount(_maximum.text),
        first = widget.allowPeriodState ? _date(_first.text) : null,
        last = widget.allowPeriodState ? _date(_last.text) : null;
    if (min != null && max != null && min > max) {
      setState(() => _error = 'Minimum must not exceed maximum.');
      return;
    }
    if (first != null && last != null && first.compareTo(last) > 0) {
      setState(() => _error = 'Start date must not follow end date.');
      return;
    }
    widget.onApply(
      FinancialFilter(
        section: _section,
        status: widget.allowPeriodState ? _status : RecordStatus.all,
        currency: _currency,
        contactId: _contact,
        categoryId: _category,
        sourceId: _source,
        automaticOnly: _mode == 'automaticOnly',
        paymentMode: switch (_mode) {
          'manual' => PaymentMode.manual,
          'automatic' => PaymentMode.automatic,
          'automaticConfirmation' => PaymentMode.automaticConfirmation,
          _ => null,
        },
        minimumMinor: min,
        maximumMinor: max,
        firstDate: first,
        lastDate: last,
        lifecycle: widget.allowLifecycle ? _lifecycle : null,
        text: widget.initial.text,
      ),
    );
  }

  Future<void> _pickPerson() async {
    final repository = ref.read(catalogRepositoryProvider);
    final value = await pickCatalog<Contact>(
      context,
      title: 'Choose person or organization',
      stream: repository.watchContacts(),
      more: (cursor) => repository.getContacts(after: cursor),
      label: (value) => value.name,
      active: (value) => !value.archived,
    );
    if (mounted && value != null) {
      setState(() {
        _contact = value.id;
        _contactName = value.name;
      });
    }
  }

  Future<void> _pickCategory() async {
    final repository = ref.read(catalogRepositoryProvider);
    final value = await pickCatalog<Category>(
      context,
      title: 'Choose category',
      stream: repository.watchCategories(),
      more: (cursor) => repository.getCategories(after: cursor),
      label: (value) => value.name,
      active: (value) => value.active,
    );
    if (mounted && value != null) {
      setState(() {
        _category = value.id;
        _categoryName = value.name;
      });
    }
  }

  Future<void> _pickSource() async {
    final repository = ref.read(catalogRepositoryProvider);
    final value = await pickCatalog<PaymentSource>(
      context,
      title: 'Choose payment source',
      stream: repository.watchSources(),
      more: (cursor) => repository.getSources(after: cursor),
      label: (value) => value.name,
      active: (value) => value.active,
    );
    if (mounted && value != null) {
      setState(() {
        _source = value.id;
        _sourceName = value.name;
      });
    }
  }

  Widget _picker(
    String label,
    String? selected,
    VoidCallback choose,
    VoidCallback clear,
  ) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        OutlinedButton(
          onPressed: choose,
          child: Text(selected ?? 'Choose $label'),
        ),
        if (selected != null)
          TextButton(onPressed: clear, child: Text('Clear $label')),
      ],
    ),
  );
  @override
  Widget build(BuildContext context) => Form(
    key: _form,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.showSection) ...[
          DropdownButtonFormField<ObligationSection>(
            key: const Key('filter-section'),
            initialValue: _section,
            isExpanded: true,
            hint: const Text('All obligations'),
            decoration: const InputDecoration(labelText: 'Obligation type'),
            items: const [
              DropdownMenuItem(child: Text('All obligations')),
              DropdownMenuItem(
                value: ObligationSection.iOwe,
                child: Text('I Owe'),
              ),
              DropdownMenuItem(
                value: ObligationSection.owedToMe,
                child: Text('Owed to Me'),
              ),
              DropdownMenuItem(
                value: ObligationSection.monthlyDues,
                child: Text('Monthly Dues'),
              ),
            ],
            onChanged: (value) => setState(() => _section = value),
          ),
          const SizedBox(height: 16),
        ],
        if (widget.allowPeriodState) ...[
          DropdownButtonFormField<RecordStatus>(
            key: const Key('filter-status'),
            initialValue: _status,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Payment status'),
            items: [
              for (final status in RecordStatus.values)
                DropdownMenuItem(
                  value: status,
                  child: Text(recordStatusLabel(status)),
                ),
            ],
            onChanged: (value) => setState(() => _status = value!),
          ),
          const SizedBox(height: 16),
        ],
        if (widget.allowLifecycle) ...[
          DropdownButtonFormField<ObligationLifecycle>(
            key: const Key('filter-lifecycle'),
            initialValue: _lifecycle,
            isExpanded: true,
            hint: const Text('All bills'),
            decoration: const InputDecoration(labelText: 'Bill status'),
            items: const [
              DropdownMenuItem(child: Text('All bills')),
              DropdownMenuItem(
                value: ObligationLifecycle.active,
                child: Text('Active'),
              ),
              DropdownMenuItem(
                value: ObligationLifecycle.paused,
                child: Text('Paused'),
              ),
              DropdownMenuItem(
                value: ObligationLifecycle.ended,
                child: Text('Ended'),
              ),
              DropdownMenuItem(
                value: ObligationLifecycle.cancelled,
                child: Text('Cancelled'),
              ),
            ],
            onChanged: (value) => setState(() => _lifecycle = value),
          ),
          const SizedBox(height: 16),
          const Text(
            'Use Billing periods to filter by payment status or due date.',
          ),
          const SizedBox(height: 16),
        ],
        DropdownButtonFormField<CurrencyCode>(
          key: const Key('filter-currency'),
          initialValue: _currency,
          isExpanded: true,
          hint: const Text('All currencies'),
          decoration: const InputDecoration(labelText: 'Currency'),
          items: [
            const DropdownMenuItem(child: Text('All currencies')),
            for (final currency in CurrencyCode.values)
              DropdownMenuItem(value: currency, child: Text(currency.code)),
          ],
          onChanged: (value) => setState(() {
            _currency = value;
            _minimum.clear();
            _maximum.clear();
          }),
        ),
        const SizedBox(height: 16),
        Text(
          'Filter original amounts${_currency == null ? ' · choose one currency first' : ' in ${_currency!.code}'}.',
        ),
        const SizedBox(height: 8),
        TextFormField(
          key: const Key('filter-minimum'),
          controller: _minimum,
          enabled: _currency != null,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          validator: _amountValidation,
          decoration: const InputDecoration(labelText: 'Minimum amount'),
        ),
        const SizedBox(height: 12),
        TextFormField(
          key: const Key('filter-maximum'),
          controller: _maximum,
          enabled: _currency != null,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          validator: _amountValidation,
          decoration: const InputDecoration(labelText: 'Maximum amount'),
        ),
        const SizedBox(height: 16),
        if (widget.allowPeriodState) ...[
          TextFormField(
            key: const Key('filter-first-date'),
            controller: _first,
            validator: (v) => dateValidation(v, optional: true),
            decoration: const InputDecoration(
              labelText: 'Due from (YYYY-MM-DD)',
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: const Key('filter-last-date'),
            controller: _last,
            validator: (v) => dateValidation(v, optional: true),
            decoration: const InputDecoration(
              labelText: 'Due until (YYYY-MM-DD)',
            ),
          ),
          const SizedBox(height: 16),
        ],
        DropdownButtonFormField<String>(
          key: const Key('filter-mode'),
          initialValue: _mode,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Payment behavior'),
          items: const [
            DropdownMenuItem(
              value: 'all',
              child: Text('All payment behaviors'),
            ),
            DropdownMenuItem(value: 'manual', child: Text('Manual')),
            DropdownMenuItem(
              value: 'automaticOnly',
              child: Text('Any automatic deduction'),
            ),
            DropdownMenuItem(value: 'automatic', child: Text('Automatic')),
            DropdownMenuItem(
              value: 'automaticConfirmation',
              child: Text('Automatic with confirmation'),
            ),
          ],
          onChanged: (value) => setState(() => _mode = value!),
        ),
        const SizedBox(height: 16),
        _picker(
          'person',
          _contact == null
              ? null
              : _contactName ?? 'Selected person or organization',
          _pickPerson,
          () => setState(() {
            _contact = null;
            _contactName = null;
          }),
        ),
        _picker(
          'category',
          _category == null ? null : _categoryName ?? 'Selected category',
          _pickCategory,
          () => setState(() {
            _category = null;
            _categoryName = null;
          }),
        ),
        _picker(
          'payment source',
          _source == null ? null : _sourceName ?? 'Selected payment source',
          _pickSource,
          () => setState(() {
            _source = null;
            _sourceName = null;
          }),
        ),
        if (_error != null)
          Text(
            _error!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        FilledButton(
          key: const Key('filter-apply'),
          onPressed: _apply,
          child: const Text('Apply filters'),
        ),
        TextButton(
          key: const Key('filter-reset'),
          onPressed: () => widget.onApply(
            FinancialFilter(
              section: widget.showSection ? null : widget.initial.section,
            ),
          ),
          child: const Text('Reset filters'),
        ),
      ],
    ),
  );
}
