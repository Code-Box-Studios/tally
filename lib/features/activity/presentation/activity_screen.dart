import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/config/environment.dart';
import '../../../core/config/environment_providers.dart';
import '../../../core/dates/financial_clock.dart';
import '../../../core/dates/timezone_catalog.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/page_body.dart';
import '../../../shared/widgets/paged_records.dart';
import '../../auth/presentation/auth_providers.dart';
import '../domain/activity_entry.dart';
import 'activity_providers.dart';
import 'activity_row.dart';

class ActivityScreen extends ConsumerWidget {
  const ActivityScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(environmentProvider).mode == AppEnvironment.preview) {
      return const PageBody(
        title: 'Activity',
        subtitle: 'Every payment has a story.',
        child: EmptyState(
          icon: Icons.history,
          title: 'Your story starts here',
          description:
              'Payments and changes to your obligations will appear here.',
        ),
      );
    }
    final timezone = ref.watch(userProfileProvider).timezone;
    final now = TimezoneCatalog.at(ref.watch(financialClockProvider), timezone);
    String dayLabel(DateTime instant) {
      final day = TimezoneCatalog.at(instant, timezone);
      final delta = DateTime.utc(
        now.year,
        now.month,
        now.day,
      ).difference(DateTime.utc(day.year, day.month, day.day)).inDays;
      return delta == 0
          ? 'Today'
          : delta == 1
          ? 'Yesterday'
          : DateFormat('MMMM d, y').format(day);
    }

    return PageBody(
      title: 'Activity',
      subtitle: 'Every payment has a story.',
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(22),
          child: PagedRecords<ActivityEntry>(
            first: ref.watch(activityPageProvider),
            loadMore: (cursor) =>
                ref.read(activityRepositoryProvider).getActivity(after: cursor),
            identity: (entry) => entry.id.value,
            onRetry: () => ref.invalidate(activityPageProvider),
            empty: const EmptyState(
              icon: Icons.history,
              title: 'Your story starts here',
              description: 'Add an obligation or record a payment to start your history.',
            ),
            builder: (context, entries, complete) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var i = 0; i < entries.length; i++) ...[
                  if (i == 0 ||
                      dayLabel(entries[i].recordedAt) !=
                          dayLabel(entries[i - 1].recordedAt))
                    Padding(
                      padding: const EdgeInsets.only(top: 16, bottom: 4),
                      child: Text(
                        dayLabel(entries[i].recordedAt),
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                    ),
                  ActivityRow(
                    key: ValueKey(entries[i].id),
                    entry: entries[i],
                    timezone: timezone,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
