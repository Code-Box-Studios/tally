import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/environment.dart';
import '../../../core/config/environment_providers.dart';
import '../../../core/theme/theme_controller.dart';
import '../../../shared/widgets/page_body.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeModeProvider);
    final preview =
        ref.watch(environmentProvider).mode == AppEnvironment.preview;
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
