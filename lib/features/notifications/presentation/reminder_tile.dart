import 'package:flutter/material.dart';

import '../../../shared/widgets/money_text.dart';
import '../domain/reminder_entry.dart';

String reminderKindLabel(ReminderKind kind) => switch (kind) {
  ReminderKind.upcoming => 'Due soon',
  ReminderKind.dueToday => 'Due today',
  ReminderKind.overdue => 'Overdue',
  ReminderKind.automaticUpcoming => 'Upcoming auto deduction',
  ReminderKind.automaticConfirmation => 'Confirm auto deduction',
  ReminderKind.owedToMe => 'Owed to you',
};

class ReminderTile extends StatelessWidget {
  const ReminderTile({
    super.key,
    required this.entry,
    required this.onOpen,
    required this.onRead,
    required this.busy,
    this.wasRead = false,
  });
  final ReminderEntry entry;
  final VoidCallback onOpen;
  final VoidCallback? onRead;
  final bool busy;
  final bool wasRead;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: 12,
            runSpacing: 8,
            children: [
              Text(
                reminderKindLabel(entry.kind),
                style: Theme.of(context).textTheme.labelLarge,
              ),
              if (entry.readAt == null && !wasRead)
                const Text('Unread')
              else
                const Text('Read'),
            ],
          ),
          const SizedBox(height: 10),
          Text(entry.title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          if (entry.amount != null)
            MoneyText(money: entry.amount!, includeCode: true)
          else
            Text('Amount needed · ${entry.currency.code}'),
          const SizedBox(height: 8),
          Text('Reminder ${entry.civilTargetDate} · ${entry.savedTimezone}'),
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            children: [
              OutlinedButton(
                key: Key('reminder-open-${entry.id}'),
                onPressed: onOpen,
                child: const Text('View obligation'),
              ),
              if (entry.readAt == null && !wasRead)
                TextButton(
                  key: Key('reminder-read-${entry.id}'),
                  onPressed: busy ? null : onRead,
                  child: const Text('Mark read'),
                ),
            ],
          ),
        ],
      ),
    ),
  );
}
