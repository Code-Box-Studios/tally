import 'package:path_provider/path_provider.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../../core/session/private_session_cleanup.dart';
import '../domain/deletion_handoff_store.dart';
import '../domain/owner_local_cleanup.dart';
import 'owner_local_cleanup_native.dart';
import 'owner_local_guard.dart';

OwnerLocalCleanup createOwnerLocalCleanup({
  required DeletionHandoffStore handoffs,
  required PrivateSessionCleanup resources,
  required OwnerLocalGuard guard,
}) => _NativeCleanup(handoffs, resources, guard);

final class _NativeCleanup implements OwnerLocalCleanup {
  _NativeCleanup(this.handoffs, this.resources, this.guard);
  final DeletionHandoffStore handoffs;
  final PrivateSessionCleanup resources;
  final OwnerLocalGuard guard;
  @override
  Future<void> quiesceAndPurge(OwnerUid owner, String environment) async {
    final cleanup = NativeOwnerLocalCleanup(
      root: await getApplicationSupportDirectory(),
      handoffs: handoffs,
      resources: resources,
      guard: guard,
    );
    await cleanup.quiesceAndPurge(owner, environment);
  }
}
