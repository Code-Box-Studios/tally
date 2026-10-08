import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/sync_engine.dart';
import 'sync_online_events.dart';
import 'sync_providers.dart';
import 'pending_evidence_providers.dart';

final syncOnlineEventsProvider = Provider<Stream<void>>(
  (_) => syncOnlineEvents(),
);

/// Starts owner-bound reconciliation and wakes it on resume/connectivity.
class SyncSessionHost extends ConsumerStatefulWidget {
  const SyncSessionHost({super.key, required this.child});
  final Widget child;
  @override
  ConsumerState<SyncSessionHost> createState() => _SyncSessionHostState();
}

class _SyncSessionHostState extends ConsumerState<SyncSessionHost>
    with WidgetsBindingObserver {
  StreamSubscription<void>? _online;
  SyncEngine? _started;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _online = ref.read(syncOnlineEventsProvider).listen((_) => _wake());
  }

  void _wake() {
    if (!mounted) return;
    final engine = ref.read(syncEngineProvider);
    if (engine != null) unawaited(engine.flush().catchError((Object _) {}));
    _wakeReceipts();
  }

  void _wakeReceipts() {
    if (!mounted ||
        (ref.read(pendingEvidenceProvider).asData?.value.isEmpty ?? true)) {
      return;
    }
    unawaited(
      ref
          .read(pendingEvidenceCoordinatorProvider.future)
          .then((coordinator) => coordinator.reconcile())
          .catchError((Object _) {}),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _wake();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_online?.cancel());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(pendingEvidenceProvider, (_, next) {
      if (next.asData?.value.isNotEmpty == true) _wakeReceipts();
    });
    ref.listen(pendingActionsProvider, (_, _) => _wakeReceipts());
    final engine = ref.watch(syncEngineProvider);
    if (engine != null && !identical(engine, _started)) {
      _started = engine;
      unawaited(engine.flush().catchError((Object _) {}));
    }
    return widget.child;
  }
}
