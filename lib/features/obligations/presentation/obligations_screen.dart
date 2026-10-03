import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/page_body.dart';
import 'add_action_sheet.dart';

class ObligationsScreen extends StatelessWidget {
  const ObligationsScreen({super.key, this.section = 'owe'});
  final String section;
  @override
  Widget build(BuildContext context) {
    final selected = ['owe', 'owed', 'dues'].contains(section)
        ? section
        : 'owe';
    final (title, description) = switch (selected) {
      'owed' => (
        'No money owed to you yet',
        'Add money you’ve lent so you can keep track of repayments.',
      ),
      'dues' => (
        'A little clarity for your regular bills',
        'Add rent, subscriptions or another monthly due.',
      ),
      _ => (
        'Nothing owed yet',
        "Add money you've borrowed or an obligation you want Tally to remember.",
      ),
    };
    return PageBody(
      title: 'Obligations',
      subtitle: 'A clear view of what’s outstanding.',
      child: Column(
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final (value, label) in const [
                ('owe', 'I Owe'),
                ('owed', 'Owed to Me'),
                ('dues', 'Monthly Dues'),
              ])
                ChoiceChip(
                  label: Text(label),
                  selected: selected == value,
                  onSelected: (_) => context.go('/obligations?section=$value'),
                ),
            ],
          ),
          const SizedBox(height: 24),
          Card(
            child: SizedBox(
              width: double.infinity,
              child: EmptyState(
                icon: Icons.wallet_outlined,
                title: title,
                description: description,
                actionLabel: 'Add obligation',
                onAction: () => showAddActionSheet(context),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
