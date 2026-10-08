import '../../../core/identifiers/entity_ids.dart';
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
    return await platform.openPlatformOutbox(
      owner: owner,
      environmentKey: environmentKey,
      trustedDevice: trustedDevice,
    );
  } on LocalOutboxFailure catch (error) {
    return OpenedOutbox(SyncCapability(error.availability));
  } catch (_) {
    return const OpenedOutbox(SyncCapability(SyncAvailability.unavailable));
  }
}
