import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../activity/domain/activity_entry.dart';
import '../../../activity/presentation/activity_providers.dart';
import '../../../activity/presentation/activity_row.dart';
import '../../../auth/presentation/auth_providers.dart';
import '../../../../shared/widgets/paged_records.dart';
import 'home_panel.dart';

class HomeActivity extends ConsumerWidget {
  const HomeActivity({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => HomePanel(
    title: 'Recent activity',
    action: TextButton(
      onPressed: () => context.go('/activity'),
      child: const Text('View all'),
    ),
    child: PagedRecords<ActivityEntry>(
      first: ref.watch(activityPageProvider),
      loadMore: (cursor) =>
          ref.read(activityRepositoryProvider).getActivity(after: cursor),
      identity: (entry) => entry.id.value,
      onRetry: () => ref.invalidate(activityPageProvider),
      empty: const Text('Your payments and changes will appear here.'),
      builder: (context, entries, complete) => Column(
        children: [
          for (final entry in entries.take(4))
            ActivityRow(
              entry: entry,
              timezone: ref.watch(userProfileProvider).timezone,
            ),
          if (entries.length > 4)
            TextButton(
              onPressed: () => context.go('/activity'),
              child: const Text('View all activity'),
            ),
        ],
      ),
    ),
  );
}
