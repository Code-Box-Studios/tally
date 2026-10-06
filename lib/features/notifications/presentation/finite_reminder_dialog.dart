import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../obligations/domain/obligation.dart';
import 'notification_settings.dart';
import 'notification_providers.dart';

class FiniteReminderDialog extends ConsumerWidget {
  const FiniteReminderDialog({super.key, required this.obligation});
  final Obligation obligation;
  @override
  Widget build(BuildContext context, WidgetRef ref) => Dialog(
    child: ConstrainedBox(
      constraints: BoxConstraints(
        maxWidth: 560,
        maxHeight: MediaQuery.sizeOf(context).height * .8,
      ),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: ref
            .watch(notificationPreferencesProvider)
            .when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, _) => Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Couldn’t load reminder settings.'),
                  TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Close'),
                  ),
                ],
              ),
              data: (prefs) => Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Reminders for ${obligation.title}',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 12),
                  Flexible(
                    child: NotificationSettingsForm(
                      preferences: prefs,
                      obligation: obligation,
                      onSaved: () => Navigator.pop(context),
                    ),
                  ),
                  TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Close'),
                  ),
                ],
              ),
            ),
      ),
    ),
  );
}
