import 'package:flutter/material.dart';

class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.description,
    this.actionLabel,
    this.onAction,
  });
  final IconData icon;
  final String title;
  final String description;
  final String? actionLabel;
  final VoidCallback? onAction;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 40, color: Theme.of(context).colorScheme.primary),
        const SizedBox(height: 20),
        Text(
          title,
          style: Theme.of(context).textTheme.titleLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(description, textAlign: TextAlign.center),
        if (actionLabel != null && onAction != null) ...[
          const SizedBox(height: 24),
          FilledButton(
            onPressed: onAction,
            child: Text(actionLabel!, textAlign: TextAlign.center),
          ),
        ],
      ],
    ),
  );
}
