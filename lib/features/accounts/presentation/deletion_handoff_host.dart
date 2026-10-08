import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/app_router.dart';
import '../../../core/config/environment.dart';
import '../../../core/config/environment_providers.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/widgets/page_body.dart';
import '../../auth/presentation/auth_providers.dart';
import '../domain/account_deletion_controller.dart';
import '../domain/deletion_handoff_store.dart';
import 'account_deletion_providers.dart';
import 'account_deletion_form.dart';
import 'deletion_progress_card.dart';
import 'deletion_recovery_providers.dart';

final deletionViewerOwnerProvider = Provider<OwnerUid?>((ref) {
  ref.watch(sessionStateProvider);
  return ref.watch(sessionControllerProvider).identity?.uid;
});
final deletionActiveScopeProvider =
    NotifierProvider<DeletionActiveScope, DeletionScope?>(
      DeletionActiveScope.new,
    );

final class DeletionActiveScope extends Notifier<DeletionScope?> {
  @override
  DeletionScope? build() => null;
  void select(DeletionScope scope) => state = scope;
  void clear() => state = null;
}

final class DeletionHandoffHost extends ConsumerStatefulWidget {
  const DeletionHandoffHost({super.key, required this.child});
  final Widget child;
  @override
  ConsumerState<DeletionHandoffHost> createState() =>
      _DeletionHandoffHostState();
}

final class _DeletionHandoffHostState
    extends ConsumerState<DeletionHandoffHost> {
  final _signingOut = <OwnerUid>{};
  final _signOutFailures = <OwnerUid>{};
  DeletionScope? _verifyScope;
  final _signedOut = <OwnerUid>{};
  void _recoverSignOut(DeletionHandoff completed, OwnerUid? viewer) {
    if (viewer != completed.owner || !_signingOut.add(completed.owner)) return;
    final authentication = ref.read(recentAuthenticationFactoryProvider)(
      completed.owner,
    );
    unawaited(() async {
      try {
        await authentication.signOutIfOwner(completed.owner);
        if (mounted) setState(() => _signedOut.add(completed.owner));
      } catch (_) {
        if (mounted) setState(() => _signOutFailures.add(completed.owner));
      }
    }());
  }

  void _continue(OwnerUid owner) {
    ref.read(deletionRecoveryProvider.notifier).dismissCompleted(owner);
    if (ref.read(deletionActiveScopeProvider)?.owner == owner) {
      ref.read(deletionActiveScopeProvider.notifier).clear();
    }
    ref.read(appRouterProvider).go('/sign-in');
  }

  Widget _page(Widget content) => Scaffold(
    body: SafeArea(
      child: PageBody(
        title: 'Your account',
        subtitle: 'Keep your account changes clear.',
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: content,
        ),
      ),
    ),
  );
  @override
  Widget build(BuildContext context) {
    if (ref.watch(environmentProvider).mode == AppEnvironment.preview) {
      return widget.child;
    }
    final recovered = ref.watch(deletionRecoveryProvider);
    if (recovered.isLoading) {
      return _page(
        const Card(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Checking saved account changes'),
                SizedBox(height: 24),
                LinearProgressIndicator(),
              ],
            ),
          ),
        ),
      );
    }
    final report = recovered.value;
    if (report == null || report.needsRecovery) {
      return _page(
        const DeletionProgressCard(
          state: DeletionState(DeletionPhase.recoveryRequired),
        ),
      );
    }
    final active = ref.watch(deletionActiveScopeProvider);
    if (active == null && report.pending.isEmpty && report.completed.isEmpty) {
      return widget.child;
    }
    final viewer = ref.watch(deletionViewerOwnerProvider);
    if (active != null && (viewer == active.owner || viewer == null)) {
      final controller = ref.watch(accountDeletionControllerProvider(active));
      final state =
          ref.watch(accountDeletionStateProvider(active)).value ??
          controller.state;
      final accepted = const {
        DeletionPhase.accepted,
        DeletionPhase.cleaning,
        DeletionPhase.cleanupRequired,
        DeletionPhase.signOutRequired,
        DeletionPhase.localComplete,
      }.contains(state.phase);
      final holding =
          accepted ||
          state.phase == DeletionPhase.requesting ||
          state.phase == DeletionPhase.uncertain ||
          state.phase == DeletionPhase.recoveryRequired;
      if (_verifyScope == active && !accepted && viewer == active.owner) {
        return Scaffold(
          body: SafeArea(
            child: AccountDeletionForm(
              controller: controller,
              recovering: true,
              onCancel: () => setState(() => _verifyScope = null),
            ),
          ),
        );
      }
      if (holding && (viewer != null || accepted)) {
        return _page(
          DeletionProgressCard(
            state: state,
            onRetryOriginal: () => unawaited(controller.retryOriginal()),
            onRetryCleanup: () => unawaited(controller.retryCleanup()),
            onVerify: () => setState(() => _verifyScope = active),
            onContinue: () => _continue(active.owner),
          ),
        );
      }
    }
    final pending = report.pending
        .where(
          (record) =>
              record.owner == viewer || viewer == null && record.accepted,
        )
        .firstOrNull;
    if (pending != null) {
      final scope = (owner: pending.owner, environment: pending.environment);
      return _page(
        DeletionProgressCard(
          state: DeletionState(
            pending.accepted
                ? DeletionPhase.cleanupRequired
                : DeletionPhase.uncertain,
          ),
          onRetryCleanup: () => unawaited(
            ref.read(deletionRecoveryProvider.notifier).retry(pending.owner),
          ),
          onRetryOriginal: () {
            ref.read(deletionActiveScopeProvider.notifier).select(scope);
            unawaited(
              ref
                  .read(accountDeletionControllerProvider(scope))
                  .retryOriginal(),
            );
          },
          onVerify: () {
            ref.read(deletionActiveScopeProvider.notifier).select(scope);
            setState(() => _verifyScope = scope);
          },
        ),
      );
    }
    final completed = report.completed
        .where((record) => record.owner == viewer || viewer == null)
        .firstOrNull;
    if (completed != null) {
      _recoverSignOut(completed, viewer);
      final failed = _signOutFailures.contains(completed.owner);
      return _page(
        DeletionProgressCard(
          state: DeletionState(
            failed
                ? DeletionPhase.signOutRequired
                : viewer == completed.owner &&
                      !_signedOut.contains(completed.owner)
                ? DeletionPhase.cleaning
                : DeletionPhase.localComplete,
          ),
          onRetryCleanup: () {
            setState(() {
              _signingOut.remove(completed.owner);
              _signOutFailures.remove(completed.owner);
            });
            _recoverSignOut(completed, ref.read(deletionViewerOwnerProvider));
          },
          onContinue: () => _continue(completed.owner),
        ),
      );
    }
    return widget.child;
  }
}
