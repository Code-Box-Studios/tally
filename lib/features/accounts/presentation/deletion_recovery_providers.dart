import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/presentation/private_session_cleanup_provider.dart';

import '../../sync/presentation/sync_providers.dart';
import '../data/deletion_handoff_store.dart';
import '../data/owner_local_cleanup_factory.dart';
import '../data/owner_local_guard.dart';
import '../data/serialized_owner_cleanup.dart';
import '../domain/deletion_handoff_store.dart';
import '../domain/deletion_local_recovery.dart';
import '../domain/owner_local_cleanup.dart';

final deletionHandoffStoreProvider = Provider<DeletionHandoffStore>(
  (_) => SharedPreferencesDeletionHandoffs(),
);
final ownerLocalCleanupProvider = Provider<OwnerLocalCleanup>(
  (ref) => SerializedOwnerLocalCleanup(
    createOwnerLocalCleanup(
      handoffs: ref.watch(deletionHandoffStoreProvider),
      resources: ref.watch(privateSessionCleanupProvider),
      guard: OwnerLocalGuard.shared,
    ),
  ),
);
final deletionLocalRecoveryProvider = Provider<DeletionLocalRecovery>(
  (ref) => DeletionLocalRecovery(
    handoffs: ref.watch(deletionHandoffStoreProvider),
    cleanup: ref.watch(ownerLocalCleanupProvider),
    environment: ref.watch(syncEnvironmentProvider),
  ),
);
final deletionRecoveryProvider =
    AsyncNotifierProvider<DeletionRecoveryController, DeletionRecoveryReport>(
      DeletionRecoveryController.new,
    );

final class DeletionRecoveryController
    extends AsyncNotifier<DeletionRecoveryReport> {
  @override
  Future<DeletionRecoveryReport> build() =>
      ref.watch(deletionLocalRecoveryProvider).recover();
  Future<void> retry(OwnerUid owner) async {
    final report = await ref
        .read(deletionLocalRecoveryProvider)
        .recover(retryOwner: owner);
    if (ref.mounted) state = AsyncData(report);
  }
}
