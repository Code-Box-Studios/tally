import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/dates/timezone_catalog.dart';
import '../../../core/money/currency_code.dart';
import '../data/auth_failure.dart';
import '../domain/user_profile.dart';
import 'auth_actions.dart';
import 'auth_frame.dart';
import 'auth_providers.dart';

class OnboardingScreen extends ConsumerWidget {
  const OnboardingScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile =
        ref.watch(sessionStateProvider).value?.profile ??
        ref.read(sessionControllerProvider).state.profile;
    if (profile == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return AuthFrame(
      title: 'Let’s make it yours.',
      subtitle:
          'Two quick defaults. Each obligation still keeps its own currency.',
      child: ProfilePreferencesForm(
        key: ValueKey(profile.uid),
        profile: profile,
        onboarding: true,
      ),
    );
  }
}

class ProfilePreferencesForm extends ConsumerStatefulWidget {
  const ProfilePreferencesForm({
    super.key,
    required this.profile,
    this.onboarding = false,
  });
  final UserProfile profile;
  final bool onboarding;
  @override
  ConsumerState<ProfilePreferencesForm> createState() =>
      _ProfilePreferencesFormState();
}

class _ProfilePreferencesFormState
    extends ConsumerState<ProfilePreferencesForm> {
  final _form = GlobalKey<FormState>();
  late CurrencyCode _currency = widget.profile.defaultCurrency;
  late final TextEditingController _timezone = TextEditingController(
    text: widget.profile.timezone,
  );
  late ProfileTheme _theme = widget.profile.theme;
  bool _saved = false;
  @override
  void dispose() {
    _timezone.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final action = ref.watch(profileActionsProvider);
    return Form(
      key: _form,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DropdownButtonFormField<CurrencyCode>(
            key: const Key('profile-currency'),
            initialValue: _currency,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Default currency'),
            items: [
              for (final currency in CurrencyCode.values)
                DropdownMenuItem(value: currency, child: Text(currency.code)),
            ],
            onChanged: action.isLoading
                ? null
                : (value) {
                    if (value != null) setState(() => _currency = value);
                  },
          ),
          const SizedBox(height: 20),
          TextFormField(
            key: const Key('profile-timezone'),
            controller: _timezone,
            enabled: !action.isLoading,
            decoration: const InputDecoration(
              labelText: 'Timezone',
              helperText: 'For example, Asia/Manila or America/New_York',
            ),
            validator: (value) => TimezoneCatalog.contains(value?.trim() ?? '')
                ? null
                : 'Enter a supported timezone.',
          ),
          const SizedBox(height: 20),
          DropdownButtonFormField<ProfileTheme>(
            initialValue: _theme,
            decoration: const InputDecoration(labelText: 'Appearance'),
            items: [
              for (final theme in ProfileTheme.values)
                DropdownMenuItem(
                  value: theme,
                  child: Text(switch (theme) {
                    ProfileTheme.light => 'Light',
                    ProfileTheme.dark => 'Dark',
                    ProfileTheme.system => 'System',
                  }),
                ),
            ],
            onChanged: action.isLoading
                ? null
                : (value) {
                    if (value != null) setState(() => _theme = value);
                  },
          ),
          if (action.hasError)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: Text(
                authFailureMessage(action.error!),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          if (_saved)
            const Padding(
              padding: EdgeInsets.only(top: 16),
              child: Text('Preferences saved.'),
            ),
          const SizedBox(height: 24),
          FilledButton(
            key: const Key('profile-save'),
            onPressed: action.isLoading
                ? null
                : () async {
                    if (!(_form.currentState?.validate() ?? false)) return;
                    final saved = await ref
                        .read(profileActionsProvider.notifier)
                        .save(
                          widget.profile,
                          ProfilePreferences(
                            currency: _currency,
                            timezone: _timezone.text.trim(),
                            theme: _theme,
                            onboardingComplete: true,
                          ),
                        );
                    if (mounted && saved) setState(() => _saved = true);
                  },
            child: Text(
              action.isLoading
                  ? 'Saving…'
                  : (widget.onboarding
                        ? 'Start using Tally'
                        : 'Save preferences'),
            ),
          ),
          if (widget.onboarding)
            TextButton(
              onPressed: action.isLoading
                  ? null
                  : () => ref.read(authActionsProvider.notifier).signOut(),
              child: const Text('Use a different account'),
            ),
        ],
      ),
    );
  }
}
