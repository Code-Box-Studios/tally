import 'package:flutter/material.dart';

import '../domain/account_deletion.dart';
import '../domain/account_deletion_controller.dart';

final class DeletionProgressCard extends StatelessWidget {
  const DeletionProgressCard({
    super.key,
    required this.state,
    this.onRetryOriginal,
    this.onRetryCleanup,
    this.onContinue,
    this.onVerify,
  });
  final DeletionState state;
  final VoidCallback? onRetryOriginal, onRetryCleanup, onContinue, onVerify;
  @override
  Widget build(BuildContext context) {
    final checking = state.phase == DeletionPhase.requesting;
    final uncertain = state.phase == DeletionPhase.uncertain;
    final recovery = state.phase == DeletionPhase.recoveryRequired;
    final cleaning =
        state.phase == DeletionPhase.accepted ||
        state.phase == DeletionPhase.cleaning;
    final failed = state.phase == DeletionPhase.cleanupRequired;
    final signOut = state.phase == DeletionPhase.signOutRequired;
    final title = checking
        ? 'Confirming deletion request'
        : uncertain
        ? 'Could not confirm deletion'
        : recovery
        ? 'Saved account changes need recovery'
        : 'Deletion requested';
    final description = checking
        ? 'Tally is checking your original request. Saved changes stay on this device until acceptance is confirmed.'
        : uncertain
        ? 'Retry the original request to verify it. Your saved changes are kept until acceptance is confirmed.'
        : recovery
        ? 'Your saved data has been preserved. Reopen Tally to retry the check.'
        : signOut
        ? 'Saved Tally data on this device is cleared. Could not finish signing out. Retry sign-out to continue.'
        : failed
        ? 'This device still needs clearing. Cloud cleanup continues. Close other Tally tabs, then retry device cleanup.'
        : cleaning
        ? 'Clearing saved Tally data on this device. Cloud cleanup continues even if you close Tally.'
        : state.view?.status == DeletionStatus.complete
        ? 'Saved Tally data on this device is cleared. Your account’s cloud cleanup is complete.'
        : state.view?.status == DeletionStatus.needsRecovery
        ? 'Saved Tally data on this device is cleared. Cloud cleanup needs support to finish.'
        : 'Saved Tally data on this device is cleared. Cloud cleanup is still processing.';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Icon(
              uncertain || failed || recovery
                  ? Icons.info_outline
                  : Icons.privacy_tip_outlined,
              size: 32,
            ),
            const SizedBox(height: 16),
            Text(title, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 12),
            Text(description),
            if (checking || cleaning)
              const Padding(
                padding: EdgeInsets.only(top: 24),
                child: LinearProgressIndicator(),
              ),
            if (uncertain && onRetryOriginal != null)
              Padding(
                padding: const EdgeInsets.only(top: 24),
                child: FilledButton(
                  onPressed: onRetryOriginal,
                  child: const Text('Retry original request'),
                ),
              ),
            if (uncertain && onVerify != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: OutlinedButton(
                  onPressed: onVerify,
                  child: const Text('Verify sign-in again'),
                ),
              ),
            if (failed && onRetryCleanup != null)
              Padding(
                padding: const EdgeInsets.only(top: 24),
                child: FilledButton(
                  onPressed: onRetryCleanup,
                  child: const Text('Retry device cleanup'),
                ),
              ),
            if (signOut && onRetryCleanup != null)
              Padding(
                padding: const EdgeInsets.only(top: 24),
                child: FilledButton(
                  onPressed: onRetryCleanup,
                  child: const Text('Retry sign-out'),
                ),
              ),
            if (state.phase == DeletionPhase.localComplete &&
                onContinue != null)
              Padding(
                padding: const EdgeInsets.only(top: 24),
                child: FilledButton(
                  onPressed: onContinue,
                  child: const Text('Continue to sign-in'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
