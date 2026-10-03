import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/auth_failure.dart';
import 'auth_actions.dart';
import 'auth_frame.dart';

class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});
  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _create = false;
  bool _obscure = true;
  bool _resetSent = false;
  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    await ref
        .read(authActionsProvider.notifier)
        .submit(_email.text, _password.text, create: _create);
  }

  @override
  Widget build(BuildContext context) {
    final action = ref.watch(authActionsProvider);
    return AuthFrame(
      title: _create ? 'A little less to remember.' : 'Welcome back.',
      subtitle: _create
          ? 'Give your loans, dues and payments a place.'
          : 'Sign in to see what’s due and what’s left.',
      child: Form(
        key: _form,
        child: AutofillGroup(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                key: const Key('auth-email'),
                controller: _email,
                enabled: !action.isLoading,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  labelText: 'Email',
                  prefixIcon: Icon(Icons.mail_outline),
                ),
                validator: (value) =>
                    value != null &&
                        RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
                            .hasMatch(value.trim())
                    ? null
                    : 'Enter a valid email address.',
              ),
              const SizedBox(height: 16),
              TextFormField(
                key: const Key('auth-password'),
                controller: _password,
                enabled: !action.isLoading,
                obscureText: _obscure,
                autofillHints: [
                  _create ? AutofillHints.newPassword : AutofillHints.password,
                ],
                textInputAction: TextInputAction.done,
                onFieldSubmitted: (_) => _submit(),
                decoration: InputDecoration(
                  labelText: 'Password',
                  prefixIcon: const Icon(Icons.lock_outline),
                  suffixIcon: IconButton(
                    tooltip: _obscure ? 'Show password' : 'Hide password',
                    onPressed: () => setState(() => _obscure = !_obscure),
                    icon: Icon(
                      _obscure
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                  ),
                ),
                validator: (value) =>
                    value != null &&
                        value.isNotEmpty &&
                        (!_create || value.length >= 8)
                    ? null
                    : (_create
                          ? 'Use at least 8 characters.'
                          : 'Enter your password.'),
              ),
              if (!_create)
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: action.isLoading
                        ? null
                        : () async {
                            if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
                                .hasMatch(_email.text.trim())) {
                              _form.currentState?.validate();
                              return;
                            }
                            final sent = await ref
                                .read(authActionsProvider.notifier)
                                .reset(_email.text);
                            if (mounted && sent) {
                              setState(() => _resetSent = true);
                            }
                          },
                    child: const Text('Forgot password?'),
                  ),
                ),
              if (_resetSent)
                const Padding(
                  padding: EdgeInsets.only(bottom: 16),
                  child: Text(
                    'If an account exists for this email, you’ll receive a password reset link.',
                  ),
                ),
              if (action.hasError)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  child: Text(
                    authFailureMessage(action.error!),
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
              const SizedBox(height: 12),
              FilledButton(
                key: const Key('auth-submit'),
                onPressed: action.isLoading ? null : _submit,
                child: action.isLoading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(_create ? 'Create account' : 'Sign in'),
              ),
              const SizedBox(height: 20),
              const Row(
                children: [
                  Expanded(child: Divider()),
                  Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16),
                    child: Text('or'),
                  ),
                  Expanded(child: Divider()),
                ],
              ),
              const SizedBox(height: 20),
              OutlinedButton.icon(
                onPressed: action.isLoading
                    ? null
                    : () => ref.read(authActionsProvider.notifier).google(),
                icon: const Icon(Icons.g_mobiledata, size: 28),
                label: const Text('Continue with Google'),
              ),
              const SizedBox(height: 20),
              TextButton(
                onPressed: action.isLoading
                    ? null
                    : () => setState(() {
                        _create = !_create;
                        _resetSent = false;
                      }),
                child: Text(
                  _create
                      ? 'Already have an account? Sign in'
                      : 'New to Tally? Create an account',
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
