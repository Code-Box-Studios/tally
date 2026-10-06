import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/data/document_reader.dart';
import '../domain/attachment.dart';

abstract final class AttachmentDto {
  static Attachment fromMap(
    String id,
    Map<String, Object?> data,
    OwnerUid owner,
  ) {
    try {
      final reader = DocumentReader(data)
        ..owner(owner)
        ..storedId('attachmentId', id);
      final verifiedKeys = [
        'contentType',
        'sizeBytes',
        'sha256',
        'storageGeneration',
        'finalizedAt',
      ];
      final present = verifiedKeys
          .where((key) => reader.value(key) != null)
          .length;
      if (present != 0 && present != verifiedKeys.length) {
        throw DocumentReader.invalid();
      }
      final verification = present == 0
          ? null
          : AttachmentVerification(
              contentType: AttachmentContentType.parse(
                reader.text('contentType', max: 30),
              ),
              sizeBytes: reader.integer('sizeBytes', min: 1, max: 10485760),
              sha256: reader.text('sha256', max: 64, required: true),
              storageGeneration: reader.text(
                'storageGeneration',
                max: 20,
                required: true,
              ),
              finalizedAt: reader.dateTime('finalizedAt'),
            );
      return Attachment(
        id: AttachmentId(id),
        owner: owner,
        target: AttachmentTarget.fromStored(
          reader.text('targetType', max: 20),
          reader.text('targetId', max: 128),
        ),
        obligationId: ObligationId(reader.text('obligationId', max: 128)),
        storagePath: reader.text('storagePath', max: 300),
        filename: reader.text('filename', max: 150, required: true),
        declaredContentType: AttachmentContentType.parse(
          reader.text('declaredContentType', max: 30),
        ),
        declaredSizeBytes: reader.integer(
          'declaredSizeBytes',
          min: 1,
          max: 10485760,
        ),
        declaredSha256: reader.nullableText('declaredSha256', max: 64),
        state: reader.enumeration('state', AttachmentState.values),
        revision: reader.revision(),
        expiresAt: reader.dateTime('expiresAt'),
        createdAt: reader.dateTime('createdAt'),
        updatedAt: reader.dateTime('updatedAt'),
        verification: verification,
        rejectionReason: reader.value('rejectionReason') == null
            ? null
            : reader.enumeration('rejectionReason', AttachmentRejection.values),
        removedAt: reader.value('removedAt') == null
            ? null
            : reader.dateTime('removedAt'),
      );
    } catch (_) {
      throw DocumentReader.invalid();
    }
  }

  static AttachmentReservation reservation(
    Map<String, Object?> data,
    OwnerUid owner,
  ) {
    try {
      if (data.length != 4 ||
          !{
            'attachmentId',
            'revision',
            'storagePath',
            'expiresAt',
          }.containsAll(data.keys)) {
        throw DocumentReader.invalid();
      }
      final reader = DocumentReader(data);
      final expiry = reader.text('expiresAt', max: 30);
      final instant = DateTime.parse(expiry);
      if (!instant.isUtc || instant.toIso8601String() != expiry) {
        throw DocumentReader.invalid();
      }
      return AttachmentReservation(
        owner: owner,
        id: AttachmentId(reader.text('attachmentId', max: 128)),
        revision: reader.revision(),
        storagePath: reader.text('storagePath', max: 300),
        expiresAt: instant,
      );
    } catch (_) {
      throw DocumentReader.invalid();
    }
  }
}
