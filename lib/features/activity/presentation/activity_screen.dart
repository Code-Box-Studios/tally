import 'package:flutter/material.dart';

import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/page_body.dart';

class ActivityScreen extends StatelessWidget {
  const ActivityScreen({super.key});
  @override
  Widget build(BuildContext context) => PageBody(
    title: 'Activity',
    subtitle: 'Every payment has a story.',
    child: Card(
      child: SizedBox(
        width: double.infinity,
        child: EmptyState(
          icon: Icons.history,
          title: 'Your story starts here',
          description:
              'Payments and changes to your obligations will appear here.',
        ),
      ),
    ),
  );
}
