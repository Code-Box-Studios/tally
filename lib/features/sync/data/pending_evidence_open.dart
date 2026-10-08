import '../../../core/identifiers/entity_ids.dart';
import '../domain/pending_evidence_store.dart';
import '../domain/pending_evidence.dart';
import 'pending_evidence_open_stub.dart'
    if (dart.library.io) 'pending_evidence_open_native.dart'
    if (dart.library.js_interop) 'pending_evidence_web.dart'
    as platform;

Future<PendingEvidenceStore> openPendingEvidence({
  required OwnerUid owner,
  required String environmentKey,
  required bool trustedDevice,
}) async {
  try {
    return await platform.openPlatformEvidence(
      owner: owner,
      environmentKey: environmentKey,
      trustedDevice: trustedDevice,
    );
  } on PendingEvidenceFailure {
    rethrow;
  } catch (_) {
    throw const PendingEvidenceFailure(PendingEvidenceFailureCode.unavailable);
  }
}
