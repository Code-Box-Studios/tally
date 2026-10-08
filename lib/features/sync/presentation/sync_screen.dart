import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/domain/data_page.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/page_body.dart';
import '../domain/outbox_entry.dart';
import '../domain/sync_capability.dart';
import 'pending_actions.dart';
import 'sync_providers.dart';

String syncCapabilityMessage(
  SyncCapability capability,
) => switch (capability.availability) {
  SyncAvailability.durable => 'Changes are saved on this device before syncing. They stay separate from confirmed balances.',
  SyncAvailability.untrustedDevice => 'Offline saving is off in this browser. Choose a trusted device to keep saved actions here.',
  SyncAvailability.unsafeBrowser => 'This browser cannot safely keep offline changes. Keep your draft and reconnect to save.',
  SyncAvailability.quota => 'Local storage is full. Keep your draft and free space before saving offline.',
  SyncAvailability.unsupportedSchema => 'Saved actions need a newer app or storage recovery. Your existing history has been preserved.',
  SyncAvailability.unavailable =>
    'Offline storage is unavailable. Keep your draft and reconnect to save.',
};

class SyncScreen extends ConsumerStatefulWidget {
  const SyncScreen({super.key});
  @override
  ConsumerState<SyncScreen> createState() => _SyncScreenState();
}

class _SyncScreenState extends ConsumerState<SyncScreen> {
  bool _history = false, _busy = false;
  Object? _error;
  Future<void> _trust(bool trusted) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(setTrustedDeviceProvider)(trusted);
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = 'Couldn’t change this device setting. Your saved actions are preserved.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sync() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(syncEngineProvider)?.flush();
    } catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final runtime = ref.watch(syncRuntimeProvider);
    final pending = ref.watch(pendingActionsProvider);
    return PageBody(
      title: 'Saved actions',
      subtitle: 'See what’s waiting, what needs review and what synced.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          runtime.when(
            loading: () => const LinearProgressIndicator(),
            error: (error, _) => FinancialActionError(error: error),
            data: (value) => Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      value.capability.canQueue
                          ? 'Offline saving is ready'
                          : 'Device storage',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 8),
                    Text(syncCapabilityMessage(value.capability)),
                    if (kIsWeb) ...[
                      const SizedBox(height: 12),
                      const Text(
                        'Use this only on a device you trust. Saved financial details stay here until you remove browser data. Signing out hides them; signing in to the same account restores them.',
                      ),
                      ref
                          .watch(trustedDeviceChoiceProvider)
                          .when(
                            loading: () => const LinearProgressIndicator(),
                            error: (_, _) =>
                                const Text('Device preference unavailable.'),
                            data: (trusted) => SwitchListTile.adaptive(
                              contentPadding: EdgeInsets.zero,
                              title: const Text(
                                'Trust this device for offline saving',
                              ),
                              value: trusted,
                              onChanged:
                                  _busy ||
                                      trusted &&
                                          (pending.isLoading ||
                                              pending.hasError ||
                                              (pending
                                                      .value
                                                      ?.items
                                                      .isNotEmpty ??
                                                  true))
                                  ? null
                                  : _trust,
                            ),
                          ),
                      if (pending.value?.items.isNotEmpty ?? false)
                        const Text(
                          'Sync or resolve saved actions before turning off offline saving.',
                        ),
                    ],
                    const SizedBox(height: 12),
                    if (value.engine != null)
                      OutlinedButton.icon(
                        key: const Key('sync-now'),
                        onPressed: _busy ? null : _sync,
                        icon: const Icon(Icons.sync),
                        label: Text(_busy ? 'Syncing…' : 'Sync now'),
                      ),
                  ],
                ),
              ),
            ),
          ),
          if (_error is String)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Text(_error as String),
            ),
          if (_error != null && _error is! String)
            FinancialActionError(error: _error),
          const SizedBox(height: 24),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              ChoiceChip(
                label: const Text('Waiting to sync'),
                selected: !_history,
                onSelected: (_) => setState(() => _history = false),
              ),
              ChoiceChip(
                label: const Text('History'),
                selected: _history,
                onSelected: (_) => setState(() => _history = true),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (_history && runtime.value?.store != null)
            const _SyncHistory()
          else
            pending.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => FinancialActionError(error: error),
              data: (page) => page.items.isEmpty
                  ? const EmptyState(
                      icon: Icons.cloud_done_outlined,
                      title: 'No changes waiting on this device',
                      description: 'Saved actions appear here when Tally needs to sync or verify them.',
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        for (final entry in page.items)
                          PendingActionCard(
                            entry: entry,
                            onTap: () => context.go(
                              '/settings/sync/${entry.command.id.value}',
                            ),
                          ),
                      ],
                    ),
            ),
        ],
      ),
    );
  }
}

class _SyncHistory extends ConsumerStatefulWidget {
  const _SyncHistory();
  @override
  ConsumerState<_SyncHistory> createState() => _SyncHistoryState();
}

class _SyncHistoryState extends ConsumerState<_SyncHistory> {
  DataPage<OutboxEntry>? _first, _last;
  final _extra = <OutboxEntry>[];
  bool _busy = false;
  Object? _error;
  int _generation = 0;
  Future<void> _more(PageCursor cursor) async {
    if (_busy) return;
    final generation = _generation, store = ref.read(outboxStoreProvider);
    if (store == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final page = await store.getPage(after: cursor, limit: 100);
      if (mounted && generation == _generation) {
        setState(() {
          _extra.addAll(page.items);
          _last = page;
        });
      }
    } catch (error) {
      if (mounted && generation == _generation) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => ref
      .watch(syncHistoryProvider)
      .when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => FinancialActionError(error: error),
        data: (page) {
          if (!identical(page, _first)) {
            _generation++;
            _first = page;
            _last = null;
            _extra.clear();
            _error = null;
          }
          final rows = <String, OutboxEntry>{
            for (final row in page.items) row.command.id.value: row,
          };
          for (final row in _extra) {
            rows.putIfAbsent(row.command.id.value, () => row);
          }
          final last = _last ?? page;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (rows.isEmpty)
                const Text('No saved action history on this device.'),
              for (final row in rows.values)
                PendingActionCard(
                  entry: row,
                  onTap: () =>
                      context.go('/settings/sync/${row.command.id.value}'),
                ),
              FinancialActionError(error: _error),
              if (last.hasMore && last.nextCursor != null)
                TextButton(
                  onPressed: _busy ? null : () => _more(last.nextCursor!),
                  child: Text(_busy ? 'Loading…' : 'Load more'),
                ),
            ],
          );
        },
      );
}
