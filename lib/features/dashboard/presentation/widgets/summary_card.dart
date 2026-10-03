import 'package:flutter/material.dart';

import '../../../../core/money/money.dart';
import '../../../../shared/widgets/money_text.dart';

class SummaryCard extends StatelessWidget {
  const SummaryCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    required this.description,
    this.emphasized = false,
  });
  final String label, description;
  final Money value;
  final IconData icon;
  final bool emphasized;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      color: emphasized ? theme.colorScheme.primaryContainer : null,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: theme.colorScheme.primary),
            const SizedBox(height: 16),
            Text(label, style: theme.textTheme.bodyLarge),
            const SizedBox(height: 8),
            MoneyText(money: value, style: theme.textTheme.headlineMedium),
            const SizedBox(height: 12),
            Text(
              description,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
