import 'package:flutter/material.dart';

class PageBody extends StatelessWidget {
  const PageBody({
    super.key,
    required this.title,
    required this.subtitle,
    required this.child,
  });
  final String title;
  final String subtitle;
  final Widget child;
  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    padding: EdgeInsets.fromLTRB(
      MediaQuery.sizeOf(context).width < 600 ? 20 : 40,
      33,
      MediaQuery.sizeOf(context).width < 600 ? 20 : 40,
      112,
    ),
    child: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 1360),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 6),
            Text(subtitle),
            const SizedBox(height: 28),
            child,
          ],
        ),
      ),
    ),
  );
}
