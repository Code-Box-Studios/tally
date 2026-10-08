import '../../../core/identifiers/entity_ids.dart';
import '../domain/pending_evidence_store.dart';
import '../domain/pending_evidence.dart';

Future<PendingEvidenceStore> openPlatformEvidence({
  required OwnerUid owner,
  required String environmentKey,
  required bool trustedDevice,
  Future<void> Function()? beforeMutation,
}) async =>
    throw const PendingEvidenceFailure(PendingEvidenceFailureCode.unavailable);
