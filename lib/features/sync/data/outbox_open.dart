import '../../../core/identifiers/entity_ids.dart';
import '../../accounts/data/owner_local_guard.dart';
import '../domain/sync_capability.dart';
import 'local_outbox_failure.dart';
import 'outbox_open_result.dart';
import 'outbox_open_stub.dart'
    if (dart.library.io) 'outbox_open_native.dart'
    if (dart.library.js_interop) 'outbox_open_web.dart'
    as platform;

export 'local_outbox_failure.dart';
export 'outbox_location.dart';
export 'outbox_open_result.dart';

Future<OpenedOutbox> openOutbox({
  required OwnerUid owner,
  required String environmentKey,
  required bool trustedDevice,
}) async {
  try {
    final guard = OwnerLocalGuard.shared;
    await guard.ensureAccessible(owner, environmentKey);
    final opened = await platform.openPlatformOutbox(
      owner: owner,
      environmentKey: environmentKey,
      trustedDevice: trustedDevice,
      beforeMutation: () => guard.ensureAccessible(owner, environmentKey),
    );
    try {
      await guard.ensureAccessible(owner, environmentKey);
      return opened;
    } catch (_) {
      await opened.store?.close();
      rethrow;
    }
  } on LocalOutboxFailure catch (error) {
    return OpenedOutbox(SyncCapability(error.availability));
  } catch (_) {
    return const OpenedOutbox(SyncCapability(SyncAvailability.unavailable));
  }
}
