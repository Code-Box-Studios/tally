import '../../../core/identifiers/entity_ids.dart';
import '../domain/sync_capability.dart';
import 'outbox_open_result.dart';

Future<OpenedOutbox> openPlatformOutbox({
  required OwnerUid owner,
  required String environmentKey,
  required bool trustedDevice,
  Future<void> Function()? beforeMutation,
}) async => const OpenedOutbox(SyncCapability(SyncAvailability.unavailable));
