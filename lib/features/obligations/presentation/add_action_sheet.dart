import 'package:flutter/material.dart';

enum AddIntent { borrow, lend, monthlyDue, recurringPayment }

Future<AddIntent?> showAddActionSheet(
  BuildContext context,
) => showModalBottomSheet<AddIntent>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  useSafeArea: true,
  builder: (context) => SingleChildScrollView(
    child: Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'What would you like to track?',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          const Text(
            'Explore the actions in this preview. Entry forms are coming next.',
          ),
          const SizedBox(height: 16),
          for (final (intent, icon, label, description) in const [
            (
              AddIntent.borrow,
              Icons.south_west,
              'I borrowed money',
              'Keep track of what you owe',
            ),
            (
              AddIntent.lend,
              Icons.north_east,
              'I lent money',
              'Remember who owes you',
            ),
            (
              AddIntent.monthlyDue,
              Icons.event_repeat,
              'Add monthly due',
              'Rent, bills and regular dues',
            ),
            (
              AddIntent.recurringPayment,
              Icons.autorenew,
              'Add recurring payment',
              'Track an ongoing payment',
            ),
          ])
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(icon),
              title: Text(label),
              subtitle: Text(description),
              onTap: () => Navigator.pop(context, intent),
            ),
        ],
      ),
    ),
  ),
);
