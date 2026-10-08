import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/presentation/private_session_cleanup_provider.dart';
import '../../attachments/presentation/attachment_providers.dart';
import '../../attachments/domain/attachment.dart';
import '../../auth/presentation/auth_providers.dart';
import '../data/pending_evidence_open.dart';
import '../domain/command_name.dart';
import '../domain/outbox_entry.dart';
import '../domain/command_submission.dart';
import '../domain/pending_evidence.dart';
import '../domain/pending_evidence_store.dart';
import 'pending_evidence_coordinator.dart';
import 'sync_providers.dart';

final pendingEvidenceFactoryProvider = Provider((_) => openPendingEvidence);
final pendingEvidenceStoreProvider = FutureProvider<PendingEvidenceStore>((
  ref,
) async {
  final owner = ref.watch(ownerUidProvider),
      environment = ref.watch(syncEnvironmentProvider),
      factory = ref.watch(pendingEvidenceFactoryProvider);
  final trusted = await ref.watch(trustedDeviceChoiceProvider.future);
  if (!ref.mounted) {
    throw const PendingEvidenceFailure(PendingEvidenceFailureCode.ownership);
  }
  final store = await factory(
    owner: owner,
    environmentKey: environment,
    trustedDevice: trusted,
  );
  if (!ref.mounted) {
    await store.close();
    throw const PendingEvidenceFailure(PendingEvidenceFailureCode.ownership);
  }
  final remove = ref
      .read(privateSessionCleanupProvider)
      .register(owner, store.close);
  ref.onDispose(() {
    remove();
    unawaited(store.close());
  });
  return store;
}, dependencies: [ownerUidProvider, trustedDeviceChoiceProvider]);
final pendingEvidenceProvider = StreamProvider<List<PendingEvidence>>((
  ref,
) async* {
  final store = await ref.watch(pendingEvidenceStoreProvider.future);
  if (!ref.mounted) return;
  yield* store.watch();
}, dependencies: [pendingEvidenceStoreProvider]);
final pendingEvidenceCoordinatorProvider =
    FutureProvider<PendingEvidenceCoordinator>(
      (ref) async {
        final owner = ref.watch(ownerUidProvider);
        final store = await ref.watch(pendingEvidenceStoreProvider.future);
        if (!ref.mounted) {
          throw const PendingEvidenceFailure(
            PendingEvidenceFailureCode.ownership,
          );
        }
        final coordinator = PendingEvidenceCoordinator(
          store: store,
          attachments: ref.watch(attachmentsRepositoryProvider),
          isOwnerActive: () => ref.mounted,
          resolvePayment: (id) async {
            if (!ref.mounted) return null;
            final runtime = await ref.read(syncRuntimeProvider.future);
            if (!ref.mounted || runtime.isDisposed || runtime.owner != owner) {
              return null;
            }
            final row = await runtime.store?.get(id);
            if (row == null ||
                row.command.owner != owner ||
                row.state != OutboxState.accepted ||
                !{
                  CommandName.recordPayment,
                  CommandName.recordInstallmentPayment,
                  CommandName.confirmDeduction,
                }.contains(row.command.name)) {
              return null;
            }
            final payment = row.result?['paymentId'];
            return payment is String ? PaymentId(payment) : null;
          },
        );
        final remove = ref
            .read(privateSessionCleanupProvider)
            .register(owner, coordinator.dispose);
        ref.onDispose(() {
          remove();
          unawaited(coordinator.dispose());
        });
        return coordinator;
      },
      dependencies: [
        ownerUidProvider,
        pendingEvidenceStoreProvider,
        attachmentsRepositoryProvider,
        syncRuntimeProvider,
      ],
    );

final receiptBytesAvailableProvider = FutureProvider.autoDispose
    .family<bool, CommandId>((ref, id) async {
      ref.watch(pendingEvidenceProvider);
      final store = await ref.watch(pendingEvidenceStoreProvider.future);
      try {
        await store.readFile(id);
        return true;
      } on PendingEvidenceFailure {
        return false;
      }
    }, dependencies: [pendingEvidenceProvider, pendingEvidenceStoreProvider]);

/// Receipt errors are surfaced separately after financial saving has succeeded.
Future<void> stagePaymentReceipt(
  WidgetRef ref,
  CommandId id,
  AttachmentFileInput file, {
  PaymentId? paymentId,
}) async {
  final coordinator = await ref.read(pendingEvidenceCoordinatorProvider.future);
  await coordinator.stage(id, file, paymentId: paymentId);
  unawaited(coordinator.reconcile().catchError((Object _) {}));
}

Future<String?> keepSubmittedReceipt(
  WidgetRef ref,
  CommandSubmission<Object?> submission,
  AttachmentFileInput? file, {
  PaymentId? paymentId,
}) async {
  if (file == null) return null;
  try {
    final (owner, id) = switch (submission) {
      QueuedSubmission(:final owner, :final commandId) => (owner, commandId),
      AcceptedSubmission(:final owner, :final commandId) => (owner, commandId),
    };
    if (owner != ref.read(ownerUidProvider) || id == null) {
      throw const PendingEvidenceFailure(PendingEvidenceFailureCode.ownership);
    }
    await stagePaymentReceipt(ref, id, file, paymentId: paymentId);
    return null;
  } catch (error) {
    return error is PendingEvidenceFailure
        ? error.message
        : 'Your payment is saved. The receipt could not be kept. Choose it again later.';
  }
}
