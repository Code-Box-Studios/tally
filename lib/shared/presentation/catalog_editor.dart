import '../../features/sync/presentation/submission_feedback.dart';
import '../../features/sync/domain/command_identity.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/identifiers/entity_ids.dart';
import '../domain/catalog.dart';
import '../widgets/financial_labels.dart';
import 'financial_actions.dart';
import 'financial_form_support.dart';

enum CatalogEditorKind { contact, source, category }

final class CatalogEditorResult {
  const CatalogEditorResult(
    this.name, {
    this.contactId,
    this.sourceId,
    this.categoryId,
    this.waitingToSync = false,
  });
  final String name;
  final ContactId? contactId;
  final SourceId? sourceId;
  final CategoryId? categoryId;
  final bool waitingToSync;
}

class CatalogEditor extends ConsumerStatefulWidget {
  const CatalogEditor({
    super.key,
    required this.kind,
    this.contact,
    this.source,
    this.category,
  });
  final CatalogEditorKind kind;
  final Contact? contact;
  final PaymentSource? source;
  final Category? category;
  @override
  ConsumerState<CatalogEditor> createState() => _CatalogEditorState();
}

class _CatalogEditorState extends ConsumerState<CatalogEditor> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name,
      _notes,
      _email,
      _phone,
      _address,
      _organization,
      _nickname,
      _lastFour;
  late ContactKind _contactKind;
  late SourceKind _sourceKind;
  late bool _active;
  bool _submitted = false;
  @override
  void initState() {
    super.initState();
    _name = TextEditingController(
      text:
          widget.contact?.name ??
          widget.source?.name ??
          widget.category?.name ??
          '',
    );
    _notes = TextEditingController(
      text: widget.contact?.notes ?? widget.source?.notes ?? '',
    );
    _email = TextEditingController(text: widget.contact?.email);
    _phone = TextEditingController(text: widget.contact?.phone);
    _address = TextEditingController(text: widget.contact?.address);
    _organization = TextEditingController(
      text: widget.contact?.organizationType,
    );
    _nickname = TextEditingController(text: widget.source?.nickname);
    _lastFour = TextEditingController(text: widget.source?.lastFour);
    _contactKind = widget.contact?.kind ?? ContactKind.person;
    _sourceKind = widget.source?.kind ?? SourceKind.cash;
    _active = widget.contact != null
        ? !widget.contact!.archived
        : widget.source?.active ?? widget.category?.active ?? true;
  }

  @override
  void dispose() {
    for (final controller in [
      _name,
      _notes,
      _email,
      _phone,
      _address,
      _organization,
      _nickname,
      _lastFour,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  String? _optional(TextEditingController controller) =>
      controller.text.trim().isEmpty ? null : controller.text.trim();
  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _submitted = true);
    final actions = ref.read(financialActionsProvider.notifier);
    CatalogEditorResult? result;
    switch (widget.kind) {
      case CatalogEditorKind.contact:
        final saved = await actions.saveContact(
          ContactDraft(
            name: _name.text.trim(),
            kind: _contactKind,
            organizationType: _contactKind == ContactKind.organization
                ? _optional(_organization)
                : null,
            email: _optional(_email),
            phone: _optional(_phone),
            address: _optional(_address),
            notes: _notes.text.trim(),
            archived: !_active,
          ),
          id: widget.contact?.id,
          revision: widget.contact?.revision,
        );
        if (saved != null) {
          final queued = saved is QueuedSubmission<Object?>;
          final item =
              saved.acceptedValue?.id ??
              ContactId(
                widget.contact?.id.value ??
                    predictedCommandId(
                      (saved as QueuedSubmission<Object?>).owner,
                      (saved as QueuedSubmission<Object?>).commandId,
                      'contact',
                    ),
              );
          result = CatalogEditorResult(
            '${_name.text.trim()}${queued ? ' · Waiting to sync' : ''}',
            contactId: item,
            waitingToSync: queued,
          );
          if (mounted) handleQueuedSubmission(context, saved);
        }
      case CatalogEditorKind.source:
        final saved = await actions.saveSource(
          SourceDraft(
            name: _name.text.trim(),
            kind: _sourceKind,
            nickname: _optional(_nickname),
            lastFour: _optional(_lastFour),
            notes: _notes.text.trim(),
            active: _active,
          ),
          id: widget.source?.id,
          revision: widget.source?.revision,
        );
        if (saved != null) {
          final queued = saved is QueuedSubmission<Object?>;
          final item =
              saved.acceptedValue?.id ??
              SourceId(
                widget.source?.id.value ??
                    predictedCommandId(
                      (saved as QueuedSubmission<Object?>).owner,
                      (saved as QueuedSubmission<Object?>).commandId,
                      'source',
                    ),
              );
          result = CatalogEditorResult(
            '${_name.text.trim()}${queued ? ' · Waiting to sync' : ''}',
            sourceId: item,
            waitingToSync: queued,
          );
          if (mounted) handleQueuedSubmission(context, saved);
        }
      case CatalogEditorKind.category:
        final saved = await actions.saveCategory(
          CategoryDraft(name: _name.text.trim(), active: _active),
          id: widget.category?.id,
          revision: widget.category?.revision,
        );
        if (saved != null) {
          final queued = saved is QueuedSubmission<Object?>;
          final item =
              saved.acceptedValue?.id ??
              CategoryId(
                widget.category?.id.value ??
                    predictedCommandId(
                      (saved as QueuedSubmission<Object?>).owner,
                      (saved as QueuedSubmission<Object?>).commandId,
                      'category',
                    ),
              );
          result = CatalogEditorResult(
            '${_name.text.trim()}${queued ? ' · Waiting to sync' : ''}',
            categoryId: item,
            waitingToSync: queued,
          );
          if (mounted) handleQueuedSubmission(context, saved);
        }
    }
    if (mounted && result != null) Navigator.pop(context, result);
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    int max = 120,
    String? Function(String?)? validate,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: TextFormField(
      key: controller == _name ? const Key('catalog-name') : null,
      controller: controller,
      maxLength: max,
      decoration: InputDecoration(labelText: label, counterText: ''),
      validator: validate,
    ),
  );
  @override
  Widget build(BuildContext context) {
    final action = ref.watch(financialActionsProvider);
    final editing =
        widget.contact != null ||
        widget.source != null ||
        widget.category != null;
    final noun = switch (widget.kind) {
      CatalogEditorKind.contact => 'person or organization',
      CatalogEditorKind.source => 'payment source',
      CatalogEditorKind.category => 'category',
    };
    return Form(
      key: _form,
      child: FinancialDialogBody(
        title: '${editing ? 'Edit' : 'Add'} $noun',
        children: [
          _field(
            _name,
            'Name',
            max: widget.kind == CatalogEditorKind.category ? 80 : 120,
            validate: requiredText,
          ),
          if (widget.kind == CatalogEditorKind.contact) ...[
            DropdownButtonFormField<ContactKind>(
              initialValue: _contactKind,
              decoration: const InputDecoration(labelText: 'Contact type'),
              items: const [
                DropdownMenuItem(
                  value: ContactKind.person,
                  child: Text('Person'),
                ),
                DropdownMenuItem(
                  value: ContactKind.organization,
                  child: Text('Organization'),
                ),
              ],
              onChanged: (kind) => setState(() => _contactKind = kind!),
            ),
            const SizedBox(height: 14),
            if (_contactKind == ContactKind.organization)
              _field(_organization, 'Organization type (optional)', max: 80),
            _field(_email, 'Email (optional)', max: 254),
            _field(_phone, 'Phone (optional)', max: 40),
            _field(_address, 'Address (optional)', max: 500),
          ],
          if (widget.kind == CatalogEditorKind.source) ...[
            DropdownButtonFormField<SourceKind>(
              initialValue: _sourceKind,
              decoration: const InputDecoration(labelText: 'Source type'),
              isExpanded: true,
              items: [
                for (final kind in SourceKind.values)
                  DropdownMenuItem(value: kind, child: Text(sourceLabel(kind))),
              ],
              onChanged: (kind) => setState(() => _sourceKind = kind!),
            ),
            const SizedBox(height: 14),
            _field(_nickname, 'Nickname (optional)'),
            _field(
              _lastFour,
              'Last four digits (optional)',
              max: 4,
              validate: (value) =>
                  (value ?? '').isEmpty ||
                      RegExp(r'^[0-9]{4}$').hasMatch(value!)
                  ? null
                  : 'Enter exactly four digits.',
            ),
            const Text(
              'A label to organize payments. Keep card credentials and passwords out of notes.',
            ),
            const SizedBox(height: 14),
          ],
          if (widget.kind != CatalogEditorKind.category)
            _field(_notes, 'Notes (optional)', max: 4000),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(
              widget.kind == CatalogEditorKind.contact
                  ? 'Active contact'
                  : 'Active',
            ),
            subtitle: const Text('Inactive items keep their history.'),
            value: _active,
            onChanged: (value) => setState(() => _active = value!),
          ),
          FinancialActionError(error: _submitted ? action.error : null),
          FilledButton(
            onPressed: action.isLoading ? null : _save,
            child: Text(action.isLoading ? 'Saving…' : 'Save'),
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
