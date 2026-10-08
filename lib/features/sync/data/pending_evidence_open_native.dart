import 'package:path_provider/path_provider.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../domain/pending_evidence_store.dart';
import 'pending_evidence_native.dart';

Future<PendingEvidenceStore> openPlatformEvidence({
  required OwnerUid owner,
  required String environmentKey,
  required bool trustedDevice,
  Future<void> Function()? beforeMutation,
}) async => NativePendingEvidenceStore.open(
  root: await getApplicationSupportDirectory(),
  owner: owner,
  environmentKey: environmentKey,
  beforeMutation: beforeMutation,
);
