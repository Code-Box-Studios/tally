enum SyncAvailability {
  durable,
  untrustedDevice,
  unsafeBrowser,
  unavailable,
  quota,
  unsupportedSchema,
}

final class SyncCapability {
  const SyncCapability(this.availability);
  final SyncAvailability availability;
  bool get canQueue => availability == SyncAvailability.durable;
}
