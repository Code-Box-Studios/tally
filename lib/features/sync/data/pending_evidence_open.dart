import '../../../core/identifiers/entity_ids.dart';
import '../../accounts/data/owner_local_guard.dart';
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
    final guard = OwnerLocalGuard.shared;
    await guard.ensureAccessible(owner, environmentKey);
    final opened = await platform.openPlatformEvidence(
      owner: owner,
      environmentKey: environmentKey,
      trustedDevice: trustedDevice,
      beforeMutation: () => guard.ensureAccessible(owner, environmentKey),
    );
    try {
      await guard.ensureAccessible(owner, environmentKey);
      return opened;
    } catch (_) {
      await opened.close();
      rethrow;
    }
  } on PendingEvidenceFailure {
    rethrow;
  } catch (_) {
    throw const PendingEvidenceFailure(PendingEvidenceFailureCode.unavailable);
  }
}
