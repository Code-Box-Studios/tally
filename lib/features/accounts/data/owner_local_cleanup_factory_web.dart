import '../../../core/session/private_session_cleanup.dart';
import '../domain/deletion_handoff_store.dart';
import '../domain/owner_local_cleanup.dart';
import 'owner_local_cleanup_web.dart';
import 'owner_local_guard.dart';

OwnerLocalCleanup createOwnerLocalCleanup({
  required DeletionHandoffStore handoffs,
  required PrivateSessionCleanup resources,
  required OwnerLocalGuard guard,
}) => WebOwnerLocalCleanup(
  handoffs: handoffs,
  resources: resources,
  guard: guard,
);
