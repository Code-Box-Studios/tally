import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/dates/timezone_catalog.dart';
import '../../../shared/widgets/money_text.dart';
import '../domain/activity_entry.dart';

class ActivityRow extends StatelessWidget {
  const ActivityRow({super.key, required this.entry, required this.timezone});
  final ActivityEntry entry;
  final String timezone;
  @override
  Widget build(BuildContext context) {
    final local = TimezoneCatalog.at(entry.recordedAt, timezone);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 13),
      child: InkWell(
        onTap: entry.obligationId == null
            ? null
            : () => context.go('/obligations/${entry.obligationId!.value}'),
        borderRadius: BorderRadius.circular(9),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(9),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                entry.type == ActivityType.paymentCorrected
                    ? Icons.undo
                    : Icons.check,
                size: 18,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    entry.title,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    entry.type.label,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    DateFormat('MMM d, y · h:mm a').format(local),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  if (entry.reason != null && entry.reason!.isNotEmpty)
                    Text(entry.reason!),
                  if (entry.amount != null) ...[
                    const SizedBox(height: 6),
                    MoneyText(money: entry.amount!, includeCode: true),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
