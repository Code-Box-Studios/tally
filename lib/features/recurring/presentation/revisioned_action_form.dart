import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/financial_failure.dart';
import '../../../shared/presentation/financial_actions.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../auth/presentation/auth_providers.dart';

/// Retains the exact command payload while a server result is uncertain.
class RevisionedActionForm<P> extends ConsumerStatefulWidget {
  const RevisionedActionForm({
    super.key,
    required this.owner,
    required this.title,
    required this.fields,
    required this.payload,
    required this.submit,
    required this.saveKey,
    required this.saveLabel,
  });
  final OwnerUid owner;
  final String title, saveLabel;
  final Key saveKey;
  final List<Widget> fields;
  final P Function() payload;
  final Future<Object?> Function(FinancialActions actions, P payload) submit;
  @override
  ConsumerState<RevisionedActionForm<P>> createState() =>
      _RevisionedActionFormState<P>();
}

class _RevisionedActionFormState<P>
    extends ConsumerState<RevisionedActionForm<P>> {
  final _form = GlobalKey<FormState>();
  P? _pending;
  bool _submitted = false, _conflict = false;
  Object? _validationError;
  Future<void> _save() async {
    if (ref.read(ownerUidProvider) != widget.owner || _conflict) return;
    if (_pending == null) {
      if (!_form.currentState!.validate()) return;
      try {
        _pending = widget.payload();
      } catch (error) {
        setState(() => _validationError = error);
        return;
      }
    }
    setState(() {
      _submitted = true;
      _validationError = null;
    });
    final result = await widget.submit(
      ref.read(financialActionsProvider.notifier),
      _pending as P,
    );
    if (!mounted || ref.read(ownerUidProvider) != widget.owner) return;
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
      _conflict =
          error is FinancialFailure &&
          error.code == FinancialFailureCode.conflict;
    });
  }

  @override
  Widget build(BuildContext context) {
    final action = ref.watch(financialActionsProvider);
    final changedOwner = ref.watch(ownerUidProvider) != widget.owner;
    return Form(
      key: _form,
      child: FinancialDialogBody(
        title: widget.title,
        children: [
          ExcludeFocus(
            excluding: _pending != null || _conflict || changedOwner,
            child: AbsorbPointer(
              absorbing: _pending != null || _conflict || changedOwner,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: widget.fields,
              ),
            ),
          ),
          if (_pending != null && !action.isLoading)
            const Padding(
              padding: EdgeInsets.only(top: 16),
              child: Text(
                'The save could not be confirmed. Retry the original action to check its result. Its values and captured revision stay the same.',
              ),
            ),
          if (_conflict)
            const Text(
              'Close this form and reopen it with the latest record before trying again.',
            ),
          if (changedOwner) const Text('Account changed. Reopen this form.'),
          FinancialActionError(
            error: _validationError ?? (_submitted ? action.error : null),
          ),
          const SizedBox(height: 16),
          FilledButton(
            key: widget.saveKey,
            onPressed: action.isLoading || _conflict || changedOwner
                ? null
                : _save,
            child: Text(
              action.isLoading
                  ? 'Saving…'
                  : _pending != null
                  ? 'Retry original action'
                  : widget.saveLabel,
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
