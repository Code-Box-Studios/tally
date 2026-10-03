import 'package:flutter/material.dart';

enum StatusTone { neutral, positive, caution, danger, automatic }

class StatusBadge extends StatelessWidget {
  const StatusBadge({
    super.key,
    required this.label,
    required this.icon,
    required this.tone,
  });
  final String label;
  final IconData icon;
  final StatusTone tone;
  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final color = switch (tone) {
      StatusTone.danger => colors.error,
      StatusTone.positive || StatusTone.automatic => colors.primary,
      StatusTone.caution => colors.tertiary,
      StatusTone.neutral => colors.onSurfaceVariant,
    };
    return DecoratedBox(
      decoration: BoxDecoration(
        color: color.withValues(alpha: .09),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        child: Wrap(
          spacing: 5,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Icon(icon, size: 16, color: color),
            Text(
              label,
              style: TextStyle(
                color: color,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
