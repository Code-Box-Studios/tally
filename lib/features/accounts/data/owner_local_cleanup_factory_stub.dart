import '../../../core/identifiers/entity_ids.dart';
import '../../../core/session/private_session_cleanup.dart';
import '../domain/deletion_handoff_store.dart';
import '../domain/owner_local_cleanup.dart';
import 'owner_local_guard.dart';

OwnerLocalCleanup createOwnerLocalCleanup({
  required DeletionHandoffStore handoffs,
  required PrivateSessionCleanup resources,
  required OwnerLocalGuard guard,
}) => const _UnsupportedCleanup();

final class _UnsupportedCleanup implements OwnerLocalCleanup {
  const _UnsupportedCleanup();
  @override
  Future<void> quiesceAndPurge(OwnerUid owner, String environment) async {
    throw const OwnerLocalCleanupFailure(
      'This device cannot clear saved Tally data. Close it and retry on a supported device.',
    );
  }
}
