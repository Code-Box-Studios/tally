import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/presentation/catalog_manager.dart';

import '../../../core/config/environment.dart';
import '../../../core/config/environment_providers.dart';
import '../../../core/theme/theme_controller.dart';
import '../../../core/money/currency_code.dart';
import '../../dashboard/presentation/dashboard_providers.dart';
import '../../../shared/widgets/page_body.dart';
import '../../auth/presentation/auth_actions.dart';
import '../../auth/presentation/auth_providers.dart';
import '../../auth/presentation/onboarding_screen.dart';
import '../../auth/data/auth_failure.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeModeProvider);
    final preview =
        ref.watch(environmentProvider).mode == AppEnvironment.preview;
    if (!preview) {
      final profile = ref.watch(userProfileProvider);
      final action = ref.watch(authActionsProvider);
      final identity = ref.read(sessionControllerProvider).identity;
      return PageBody(
        title: 'Settings',
        subtitle: 'Make Tally feel like yours.',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Your account',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      profile.displayName.isEmpty
                          ? (identity?.email ?? 'Personal workspace')
                          : profile.displayName,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Your obligations and payments stay private to this account.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: ProfilePreferencesForm(
                  key: ValueKey(profile.uid),
                  profile: profile,
                ),
              ),
            ),
            const SizedBox(height: 24),
            if (action.hasError)
              Text(
                authFailureMessage(action.error!),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            const CatalogManager(kind: CatalogEditorKind.source),
            const SizedBox(height: 24),
            Card(
              child: ListTile(
                leading: const Icon(Icons.notifications_none),
                title: const Text('Reminders'),
                subtitle: const Text(
                  'Your private inbox, reminder times and device alerts.',
                ),
                onTap: () => context.go('/settings/reminders'),
              ),
            ),
            const SizedBox(height: 24),
            const CatalogManager(kind: CatalogEditorKind.category),
            const SizedBox(height: 24),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: action.isLoading
                    ? null
                    : () => ref.read(authActionsProvider.notifier).signOut(),
                icon: const Icon(Icons.logout),
                label: const Text('Sign out'),
              ),
            ),
          ],
        ),
      );
    }
    return PageBody(
      title: 'Settings',
      subtitle: 'Make Tally feel like yours.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Appearance',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final (value, label, icon) in const [
                        (ThemeMode.light, 'Light', Icons.light_mode_outlined),
                        (ThemeMode.dark, 'Dark', Icons.dark_mode_outlined),
                        (
                          ThemeMode.system,
                          'System',
                          Icons.settings_brightness_outlined,
                        ),
                      ])
                        ChoiceChip(
                          avatar: Icon(icon, size: 18),
                          label: Text(label),
                          selected: mode == value,
                          onSelected: (_) => ref
                              .read(themeModeProvider.notifier)
                              .setMode(value),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          if (preview) ...[
            const Text('Preview currency'),
            DropdownButton<CurrencyCode>(
              value: ref.watch(selectedCurrencyProvider),
              items: [
                for (final currency in CurrencyCode.values)
                  DropdownMenuItem(value: currency, child: Text(currency.code)),
              ],
              onChanged: (value) {
                if (value != null) {
                  ref
                      .read(selectedCurrencyProvider.notifier)
                      .setCurrency(value);
                }
              },
            ),
            const Text(
              'Each currency has its own totals. No exchange conversion.',
            ),
            const SizedBox(height: 24),
          ],
          Text(
            preview
                ? 'You’re exploring a preview with sample data. Your choices apply to this session.'
                : 'Connected to local Firebase emulators. Sign-in and personal records will follow in the next increment.',
          ),
        ],
      ),
    );
  }
}
