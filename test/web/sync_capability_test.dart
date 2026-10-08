import 'package:flutter_test/flutter_test.dart';
import 'package:tally/features/sync/data/outbox_open.dart';
import 'package:tally/features/sync/domain/sync_capability.dart';

void main() {
  test('only tested multi-tab storage may claim durable financial saving', () {
    for (final mode in ['opfsShared', 'opfsLocks', 'sharedIndexedDb']) {
      expect(webOutboxCapability(mode, trustedDevice: true).canQueue, isTrue);
      expect(
        webOutboxCapability(mode, trustedDevice: false).availability,
        SyncAvailability.untrustedDevice,
      );
    }
    for (final mode in ['unsafeIndexedDb', 'inMemory', 'unknown', '']) {
      expect(
        webOutboxCapability(mode, trustedDevice: true).availability,
        SyncAvailability.unsafeBrowser,
      );
    }
  });
  test(
    'probe, quota, schema or open failure never advertises restart durability',
    () {
      for (final failure in [
        SyncAvailability.unavailable,
        SyncAvailability.quota,
        SyncAvailability.unsupportedSchema,
      ]) {
        final capability = webOutboxCapability(
          'opfsShared',
          trustedDevice: true,
          failure: failure,
        );
        expect(capability.canQueue, isFalse);
        expect(capability.availability, failure);
      }
      expect(
        webOutboxCapability(
          'opfsShared',
          trustedDevice: true,
          failure: SyncAvailability.durable,
        ).canQueue,
        isFalse,
      );
    },
  );
}
