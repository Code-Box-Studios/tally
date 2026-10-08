import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/data_page.dart';
import 'attachment.dart';

abstract interface class AttachmentsRepository {
  OwnerUid get owner;
  Stream<DataPage<Attachment>> watchTarget(AttachmentTarget target);
  Future<DataPage<Attachment>> getTarget(
    AttachmentTarget target, {
    PageCursor? after,
  });
  Future<AttachmentReservation> reserve(
    CommandId id,
    AttachmentReservationInput input,
  );
  Stream<AttachmentUploadProgress> upload(
    AttachmentReservation reservation,
    AttachmentFileInput file, {
    CommandId? commandId,
  });
  Future<AttachmentBytes> download(AttachmentId id);
  Future<int> remove(
    CommandId command,
    AttachmentId id, {
    required int expectedRevision,
  });
  Future<void> dispose();
}
