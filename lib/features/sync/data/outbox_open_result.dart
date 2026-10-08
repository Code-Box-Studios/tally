import '../domain/outbox_store.dart';
import '../domain/sync_capability.dart';

final class OpenedOutbox {
  const OpenedOutbox(this.capability, {this.store, this.storageMode});
  final SyncCapability capability;
  final OutboxStore? store;
  final String? storageMode;
}

SyncCapability webOutboxCapability(
  String mode, {
  required bool trustedDevice,
  SyncAvailability? failure,
}) {
  if (!trustedDevice) {
    return const SyncCapability(SyncAvailability.untrustedDevice);
  }
  if (failure != null) {
    return SyncCapability(
      failure == SyncAvailability.durable
          ? SyncAvailability.unavailable
          : failure,
    );
  }
  return SyncCapability(
    const {'opfsShared', 'opfsLocks', 'sharedIndexedDb'}.contains(mode)
        ? SyncAvailability.durable
        : SyncAvailability.unsafeBrowser,
  );
}
