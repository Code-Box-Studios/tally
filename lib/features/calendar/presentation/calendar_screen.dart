import 'package:flutter/material.dart';

import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/page_body.dart';

class CalendarScreen extends StatelessWidget {
  const CalendarScreen({super.key});
  @override
  Widget build(BuildContext context) => PageBody(
    title: 'Calendar',
    subtitle: 'Know what needs to be paid next.',
    child: Card(
      child: SizedBox(
        width: double.infinity,
        child: EmptyState(
          icon: Icons.calendar_month_outlined,
          title: 'A clearer month ahead',
          description:
              'Your due dates will appear here when you add an obligation.',
        ),
      ),
    ),
  );
}
