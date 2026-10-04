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
  late UserProfile _baseProfile;
  late CurrencyCode _currency;
  late final TextEditingController _timezone;
  late ProfileTheme _theme;
  bool _saved = false;
  bool _dirty = false;
  bool _remoteChanged = false;
  @override
  void initState() {
    super.initState();
    _baseProfile = widget.profile;
    _currency = _baseProfile.defaultCurrency;
    _timezone = TextEditingController(text: _baseProfile.timezone);
    _theme = _baseProfile.theme;
  }

  void _loadProfile(UserProfile profile) {
    _baseProfile = profile;
    _currency = profile.defaultCurrency;
    _timezone.text = profile.timezone;
    _theme = profile.theme;
    _dirty = false;
    _remoteChanged = false;
    _saved = false;
  }

  @override
  void didUpdateWidget(covariant ProfilePreferencesForm oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.profile.uid != _baseProfile.uid) {
      _loadProfile(widget.profile);
    } else if (widget.profile.revision != _baseProfile.revision) {
      if (_dirty) {
        _remoteChanged = true;
        _saved = false;
      } else {
        _loadProfile(widget.profile);
      }
    }
  }

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
                    if (value != null) {
                      setState(() {
                        _currency = value;
                        _dirty = true;
                        _saved = false;
                      });
                    }
                  },
          ),
          const SizedBox(height: 20),
          TextFormField(
            key: const Key('profile-timezone'),
            controller: _timezone,
            onChanged: (_) => setState(() {
              _dirty = true;
              _saved = false;
            }),
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
                    if (value != null) {
                      setState(() {
                        _theme = value;
                        _dirty = true;
                        _saved = false;
                      });
                    }
                  },
          ),
          if (_remoteChanged) ...[
            const Padding(
              padding: EdgeInsets.only(top: 16),
              child: Text(
                'Preferences changed on another device. Reload to use the latest values.',
              ),
            ),
            TextButton(
              onPressed: action.isLoading
                  ? null
                  : () => setState(() => _loadProfile(widget.profile)),
              child: const Text('Reload preferences'),
            ),
          ],
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
                          _baseProfile,
                          ProfilePreferences(
                            currency: _currency,
                            timezone: _timezone.text.trim(),
                            theme: _theme,
                            onboardingComplete: true,
                          ),
                        );
                    if (mounted && saved) {
                      setState(() {
                        _loadProfile(widget.profile);
                        _saved = true;
                      });
                    }
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
