import 'dart:async';

import 'package:flutter/material.dart';

import '../../../shared/widgets/page_body.dart';
import '../domain/account_deletion.dart';
import '../domain/account_deletion_controller.dart';
import 'deletion_progress_card.dart';

final class AccountDeletionForm extends StatefulWidget {
  const AccountDeletionForm({
    super.key,
    required this.controller,
    required this.onCancel,
    this.onSubmitting,
    this.recovering = false,
  });
  final AccountDeletionController controller;
  final VoidCallback onCancel;
  final VoidCallback? onSubmitting;
  final bool recovering;
  @override
  State<AccountDeletionForm> createState() => _AccountDeletionFormState();
}

final class _AccountDeletionFormState extends State<AccountDeletionForm> {
  final _confirmation = TextEditingController(),
      _password = TextEditingController();
  late final Stream<DeletionState> _states;
  late final Set<ReauthenticationProvider> _providers;
  ReauthenticationProvider? _provider;
  bool _acknowledged = false, _submitting = false, _verifyAgain = false;
  @override
  void initState() {
    super.initState();
    _verifyAgain = widget.recovering;
    _states = widget.controller.watch();
    _providers = widget.controller.authentication.providers;
    _provider = _providers.contains(ReauthenticationProvider.password)
        ? ReauthenticationProvider.password
        : _providers.contains(ReauthenticationProvider.google)
        ? ReauthenticationProvider.google
        : null;
  }

  @override
  void dispose() {
    _password.clear();
    _password.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting || _provider == null) return;
    setState(() {
      _submitting = true;
      _verifyAgain = false;
    });
    final input = DeletionAuthentication(
      _provider!,
      password: _provider == ReauthenticationProvider.password
          ? _password.text
          : null,
    );
    _password.clear();
    widget.onSubmitting?.call();
    await widget.controller.submit(
      DeletionConfirmation(
        acknowledged: _acknowledged,
        text: _confirmation.text,
      ),
      input,
    );
    if (mounted) setState(() => _submitting = false);
  }

  @override
  Widget build(BuildContext context) => StreamBuilder<DeletionState>(
    stream: _states,
    initialData: widget.controller.state,
    builder: (context, snapshot) {
      final state = snapshot.data ?? widget.controller.state;
      final progress = const {
        DeletionPhase.requesting,
        DeletionPhase.uncertain,
        DeletionPhase.accepted,
        DeletionPhase.cleaning,
        DeletionPhase.cleanupRequired,
        DeletionPhase.signOutRequired,
        DeletionPhase.localComplete,
        DeletionPhase.recoveryRequired,
      }.contains(state.phase);
      if (progress && !_verifyAgain) {
        return PageBody(
          title: 'Your account',
          subtitle: 'Keep your account changes clear.',
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: DeletionProgressCard(
              state: state,
              onRetryOriginal: () =>
                  unawaited(widget.controller.retryOriginal()),
              onRetryCleanup: () => unawaited(widget.controller.retryCleanup()),
              onContinue: widget.onCancel,
              onVerify: () => setState(() => _verifyAgain = true),
            ),
          ),
        );
      }
      final busy = _submitting || state.phase == DeletionPhase.reauthenticating;
      final ready =
          _acknowledged &&
          _confirmation.text == 'DELETE' &&
          _provider != null &&
          (_provider != ReauthenticationProvider.password ||
              _password.text.isNotEmpty);
      return PageBody(
        title: 'Delete your account',
        subtitle: 'Take a moment to review what will be removed.',
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Icon(
                    Icons.delete_outline,
                    size: 32,
                    color: Theme.of(context).colorScheme.error,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'This removes your Tally account, obligations, payments, receipts and reminder settings. It cannot be undone.',
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Other devices and exported files may retain copies. Backups are subject to provider retention; deletion does not guarantee immediate removal from backups.',
                  ),
                  const SizedBox(height: 24),
                  CheckboxListTile(
                    key: const Key('deletion-acknowledgement'),
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                    value: _acknowledged,
                    onChanged: busy
                        ? null
                        : (value) =>
                              setState(() => _acknowledged = value ?? false),
                    title: const Text(
                      'I understand my account and records will be permanently deleted.',
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    key: const Key('deletion-confirmation'),
                    controller: _confirmation,
                    enabled: !busy,
                    decoration: const InputDecoration(
                      labelText: 'Type DELETE to confirm',
                    ),
                    autocorrect: false,
                    enableSuggestions: false,
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'Verify your sign-in',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 12),
                  if (_providers.isEmpty)
                    const Text(
                      'Sign in with a linked password or Google account to continue.',
                    ),
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      for (final provider in _providers)
                        ChoiceChip(
                          label: Text(
                            provider == ReauthenticationProvider.password
                                ? 'Password'
                                : 'Google',
                          ),
                          selected: provider == _provider,
                          onSelected: busy
                              ? null
                              : (_) => setState(() {
                                  _password.clear();
                                  _provider = provider;
                                }),
                        ),
                    ],
                  ),
                  if (_provider == ReauthenticationProvider.password) ...[
                    const SizedBox(height: 16),
                    TextField(
                      key: const Key('deletion-password'),
                      controller: _password,
                      enabled: !busy,
                      obscureText: true,
                      enableSuggestions: false,
                      autocorrect: false,
                      decoration: const InputDecoration(
                        labelText: 'Current password',
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                  ],
                  if (state.phase == DeletionPhase.authenticationFailed)
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Text(
                        switch (state.failure) {
                          DeletionFailureCode.credentials =>
                            'Check your password and try again.',
                          DeletionFailureCode.changedOwner =>
                            'Sign in to the same account to continue.',
                          DeletionFailureCode.cancelled => 'Sign-in was cancelled. Your account has not been changed.',
                          DeletionFailureCode.popupBlocked => 'Allow pop-ups for Tally, then verify with Google again.',
                          _ => 'Couldn’t verify sign-in. Check your connection and try again.',
                        },
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                  const SizedBox(height: 24),
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      FilledButton(
                        key: const Key('deletion-submit'),
                        style: FilledButton.styleFrom(
                          backgroundColor: Theme.of(context).colorScheme.error,
                          foregroundColor: Theme.of(context)
                              .colorScheme
                              .onError,
                        ),
                        onPressed: busy || !ready
                            ? null
                            : () => unawaited(_submit()),
                        child: Text(
                          busy
                              ? 'Verifying sign-in…'
                              : 'Request account deletion',
                        ),
                      ),
                      OutlinedButton(
                        key: const Key('deletion-cancel'),
                        onPressed: busy
                            ? null
                            : widget.recovering
                            ? widget.onCancel
                            : _verifyAgain
                            ? () => setState(() => _verifyAgain = false)
                            : widget.onCancel,
                        child: Text(
                          widget.recovering || _verifyAgain
                              ? 'Back to request status'
                              : 'Keep my account',
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    },
  );
}
