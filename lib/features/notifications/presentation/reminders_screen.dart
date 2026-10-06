import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/widgets/page_body.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/error_panel.dart';
import '../../../shared/domain/data_page.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../domain/notification_repository.dart';
import '../domain/reminder_entry.dart';
import 'notification_providers.dart';
import 'notification_actions.dart';
import 'reminder_tile.dart';
import '../../../core/dates/timezone_catalog.dart';
import '../../auth/presentation/auth_providers.dart';
import '../domain/notification_platform.dart';

class RemindersScreen extends ConsumerStatefulWidget {
  const RemindersScreen({super.key, this.until, this.initialIntent});
  final DateTime? until;
  final ReminderIntent? initialIntent;
  @override
  ConsumerState<RemindersScreen> createState() => _RemindersScreenState();
}

class _RemindersScreenState extends ConsumerState<RemindersScreen> {
  late NotificationInboxQuery _query;
  final _extra = <ReminderEntry>[];
  PageCursor? _cursor;
  bool _loading = false, _exhausted = false, _cached = false;
  Object? _error;
  final _read = <String>{};
  @override
  void initState() {
    super.initState();
    _query = NotificationInboxQuery(until: widget.until ?? DateTime.now());
    if (widget.initialIntent != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _openIntent());
    }
  }

  Future<void> _openIntent() async {
    final intent = widget.initialIntent!,
        repo = ref.read(notificationRepositoryProvider);
    try {
      final record = await repo.getReminder(intent.reminderId);
      if (!mounted ||
          record == null ||
          ref.read(notificationRepositoryProvider).owner != repo.owner) {
        return;
      }
      final entry = record.value;
      if (entry.visibleAt != null &&
          entry.obligationId == intent.obligationId &&
          entry.instanceId == intent.instanceId) {
        context.go(intent.uri.toString());
      }
    } catch (_) {
      /* Keep an unavailable target inside the current owner's inbox. */
    }
  }

  void _refresh() {
    setState(() {
      _query = NotificationInboxQuery(until: widget.until ?? DateTime.now());
      _extra.clear();
      _cursor = null;
      _exhausted = false;
      _error = null;
      _read.clear();
    });
    ref.invalidate(reminderInboxProvider(_query));
  }

  Future<void> _more(DataPage<ReminderEntry> first) async {
    if (_loading || _exhausted) return;
    final repo = ref.read(notificationRepositoryProvider), owner = repo.owner;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await repo.getInbox(
        _query,
        after: _cursor ?? first.nextCursor,
      );
      if (!mounted || ref.read(notificationRepositoryProvider).owner != owner) {
        return;
      }
      setState(() {
        _extra.addAll(page.items);
        _cursor = page.nextCursor;
        _exhausted = !page.hasMore;
        _cached = page.isFromCache;
      });
    } catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _mark(ReminderEntry entry) async {
    final result = await ref
        .read(notificationActionsProvider.notifier)
        .markRead(entry);
    if (!mounted ||
        ref.read(notificationRepositoryProvider).owner != entry.owner) {
      return;
    }
    if (result != null) setState(() => _read.add(entry.id));
  }

  @override
  Widget build(BuildContext context) {
    final timezone = ref.watch(userProfileProvider).timezone;
    final today = TimezoneCatalog.at(_query.until, timezone);
    bool isToday(ReminderEntry entry) {
      final date = TimezoneCatalog.at(
        entry.visibleAt ?? entry.scheduledAt,
        timezone,
      );
      return date.year == today.year &&
          date.month == today.month &&
          date.day == today.day;
    }

    final inbox = ref.watch(reminderInboxProvider(_query)),
        action = ref.watch(notificationActionsProvider);
    return PageBody(
      title: 'Reminders',
      subtitle: 'A little heads-up for what needs your attention.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: 12,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: _refresh,
                icon: const Icon(Icons.refresh),
                label: const Text('Refresh'),
              ),
              TextButton.icon(
                onPressed: () => context.go('/settings/reminders'),
                icon: const Icon(Icons.tune),
                label: const Text('Reminder settings'),
              ),
            ],
          ),
          const SizedBox(height: 20),
          inbox.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, _) => ErrorPanel(
              title: 'Couldn’t load your reminders',
              onRetry: _refresh,
            ),
            data: (first) {
              final entries =
                  <String, ReminderEntry>{
                    for (final entry in [..._extra, ...first.items])
                      entry.id: entry,
                  }.values.toList()..sort((a, b) {
                    final time = b.scheduledAt.compareTo(a.scheduledAt);
                    return time != 0 ? time : b.id.compareTo(a.id);
                  });
              if (entries.isEmpty) {
                return const EmptyState(
                  icon: Icons.notifications_none,
                  title: 'Nothing needs a nudge yet',
                  description: 'Tally will keep your due dates and upcoming deductions here. Add an obligation or adjust your reminders.',
                );
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (first.isFromCache || _cached)
                    const Padding(
                      padding: EdgeInsets.only(bottom: 16),
                      child: Text(
                        'Cached reminders · reconnect to confirm the latest updates.',
                      ),
                    ),
                  for (final entry in entries) ...[
                    if (entry == entries.first ||
                        isToday(entry) !=
                            isToday(entries[entries.indexOf(entry) - 1]))
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Text(
                          isToday(entry) ? 'Today' : 'Earlier',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                    ReminderTile(
                      entry: entry,
                      wasRead: _read.contains(entry.id),
                      onOpen: () => context.go(
                        '/obligations/${entry.obligationId.value}?period=${entry.instanceId.value}',
                      ),
                      onRead: _read.contains(entry.id)
                          ? null
                          : () => _mark(entry),
                      busy: action.isLoading || _read.contains(entry.id),
                    ),
                  ],
                  if (first.hasMore && !_exhausted)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: OutlinedButton(
                        onPressed: _loading ? null : () => _more(first),
                        child: Text(_loading ? 'Loading…' : 'Load more'),
                      ),
                    ),
                ],
              );
            },
          ),
          FinancialActionError(error: _error ?? action.error),
        ],
      ),
    );
  }
}
