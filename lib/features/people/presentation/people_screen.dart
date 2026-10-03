import 'package:flutter/material.dart';

import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/page_body.dart';

class PeopleScreen extends StatelessWidget {
  const PeopleScreen({super.key});
  @override
  Widget build(BuildContext context) => PageBody(
    title: 'People',
    subtitle: 'The people and organizations in your circle.',
    child: Card(
      child: SizedBox(
        width: double.infinity,
        child: EmptyState(
          icon: Icons.people_outline,
          title: 'Keep your connections in view',
          description: 'Add a person or organization when you record your first obligation.',
        ),
      ),
    ),
  );
}
