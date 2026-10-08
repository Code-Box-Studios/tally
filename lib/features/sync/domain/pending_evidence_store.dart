import '../../../core/identifiers/entity_ids.dart';
import '../../attachments/domain/attachment.dart';
import 'pending_evidence.dart';

abstract interface class PendingEvidenceStore {
  OwnerUid get owner;
  bool get bytesSurviveRestart;
  Future<PendingEvidence> persist(
    CommandId commandId,
    AttachmentFileInput file,
  );
  Future<PendingEvidence?> get(CommandId commandId);
  Future<List<PendingEvidence>> list();
  Stream<List<PendingEvidence>> watch();
  Future<AttachmentFileInput> readFile(CommandId commandId);
  Future<void> update(PendingEvidence evidence);

  /// Publication cleanup supplies an expected attempt; replacement bytes stay.
  Future<bool> remove(CommandId commandId, {PendingEvidence? expected});
  Future<void> close();
}
