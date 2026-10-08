import '../../../core/session/private_session_cleanup.dart';
import '../domain/deletion_handoff_store.dart';
import '../domain/owner_local_cleanup.dart';
import 'owner_local_guard.dart';
import 'owner_local_cleanup_factory_stub.dart'
    if (dart.library.io) 'owner_local_cleanup_factory_native.dart'
    if (dart.library.js_interop) 'owner_local_cleanup_factory_web.dart'
    as platform;

OwnerLocalCleanup createOwnerLocalCleanup({
  required DeletionHandoffStore handoffs,
  required PrivateSessionCleanup resources,
  required OwnerLocalGuard guard,
}) => platform.createOwnerLocalCleanup(
  handoffs: handoffs,
  resources: resources,
  guard: guard,
);
