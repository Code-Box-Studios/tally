import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;

import '../../../core/identifiers/entity_ids.dart';
import 'attachment_policy.dart';
export 'attachment_policy.dart' show AttachmentContentType;

enum AttachmentTargetType { obligation, instance, payment }

enum AttachmentState { awaitingUpload, processing, ready, rejected, deleted }

enum AttachmentRejection {
  unsupportedFormat,
  sizeMismatch,
  checksumMismatch,
  uploadExpired,
  unavailable,
}

final class AttachmentTarget {
  const AttachmentTarget._(this.type, this.id);
  AttachmentTarget.forObligation(ObligationId id)
    : this._(AttachmentTargetType.obligation, id.value);
  AttachmentTarget.forInstance(InstanceId id)
    : this._(AttachmentTargetType.instance, id.value);
  AttachmentTarget.forPayment(PaymentId id)
    : this._(AttachmentTargetType.payment, id.value);
  factory AttachmentTarget.fromStored(String type, String id) => switch (type) {
    'obligation' => AttachmentTarget.forObligation(ObligationId(id)),
    'instance' => AttachmentTarget.forInstance(InstanceId(id)),
    'payment' => AttachmentTarget.forPayment(PaymentId(id)),
    _ => throw ArgumentError('Unsupported file target.'),
  };
  final AttachmentTargetType type;
  final String id;
  @override
  bool operator ==(Object other) =>
      other is AttachmentTarget && other.type == type && other.id == id;
  @override
  int get hashCode => Object.hash(type, id);
}

String attachmentStoragePath(OwnerUid owner, AttachmentId id) =>
    'users/${owner.value}/attachments/${id.value}/content';

final class AttachmentFileInput {
  AttachmentFileInput({
    required this.filename,
    required this.contentType,
    required Uint8List bytes,
  }) : bytes = _checkedCopy(filename, bytes);
  final String filename;
  final AttachmentContentType contentType;
  final Uint8List bytes;
  int get sizeBytes => bytes.length;
  String get sha256 => crypto.sha256.convert(bytes).toString();
  static Uint8List _checkedCopy(String filename, Uint8List bytes) {
    AttachmentPolicy.validateFilename(filename);
    AttachmentPolicy.validateSize(bytes.length);
    return Uint8List.fromList(bytes).asUnmodifiableView();
  }
}

final class AttachmentReservationInput {
  AttachmentReservationInput({
    required this.target,
    required this.filename,
    required this.contentType,
    required this.sizeBytes,
    this.sha256,
  }) {
    AttachmentPolicy.validateFilename(filename);
    AttachmentPolicy.validateSize(sizeBytes);
    AttachmentPolicy.validateSha256(sha256);
  }
  final AttachmentTarget target;
  final String filename;
  final AttachmentContentType contentType;
  final int sizeBytes;
  final String? sha256;
  Map<String, Object?> toPayload() => {
    'targetType': target.type.name,
    'targetId': target.id,
    'filename': filename,
    'contentType': contentType.mime,
    'sizeBytes': sizeBytes,
    'sha256': sha256,
  };
}

final class AttachmentReservation {
  AttachmentReservation({
    required this.owner,
    required this.id,
    required this.revision,
    required this.storagePath,
    required this.expiresAt,
  }) {
    if (revision < 1 ||
        revision >= 9007199254740991 ||
        storagePath != attachmentStoragePath(owner, id) ||
        !expiresAt.isUtc) {
      throw ArgumentError('Invalid file reservation.');
    }
  }
  final OwnerUid owner;
  final AttachmentId id;
  final int revision;
  final String storagePath;
  final DateTime expiresAt;
}

final class AttachmentVerification {
  AttachmentVerification({
    required this.contentType,
    required this.sizeBytes,
    required this.sha256,
    required this.storageGeneration,
    required this.finalizedAt,
  }) {
    AttachmentPolicy.validateSize(sizeBytes);
    AttachmentPolicy.validateSha256(sha256);
    AttachmentPolicy.validateGeneration(storageGeneration);
    if (!finalizedAt.isUtc) throw ArgumentError('Invalid file audit instant.');
  }
  final AttachmentContentType contentType;
  final int sizeBytes;
  final String sha256, storageGeneration;
  final DateTime finalizedAt;
}

final class Attachment {
  Attachment({
    required this.id,
    required this.owner,
    required this.target,
    required this.obligationId,
    required this.storagePath,
    required this.filename,
    required this.declaredContentType,
    required this.declaredSizeBytes,
    required this.declaredSha256,
    required this.state,
    required this.revision,
    required this.expiresAt,
    required this.createdAt,
    required this.updatedAt,
    this.verification,
    this.rejectionReason,
    this.removedAt,
  }) {
    AttachmentPolicy.validateFilename(filename);
    AttachmentPolicy.validateSize(declaredSizeBytes);
    AttachmentPolicy.validateSha256(declaredSha256);
    if (storagePath != attachmentStoragePath(owner, id) ||
        revision < 1 ||
        revision >= 9007199254740991 ||
        [
          expiresAt,
          createdAt,
          updatedAt,
          ?removedAt,
        ].any((value) => !value.isUtc) ||
        (target.type == AttachmentTargetType.obligation &&
            target.id != obligationId.value) ||
        (state == AttachmentState.ready && verification == null) ||
        (state == AttachmentState.rejected && rejectionReason == null) ||
        (state == AttachmentState.deleted) != (removedAt != null) ||
        (verification != null &&
            (verification!.sizeBytes != declaredSizeBytes ||
                verification!.contentType != declaredContentType ||
                declaredSha256 != null &&
                    declaredSha256 != verification!.sha256))) {
      throw ArgumentError('Invalid private file metadata.');
    }
  }
  final AttachmentId id;
  final OwnerUid owner;
  final AttachmentTarget target;
  final ObligationId obligationId;
  final String storagePath, filename;
  final AttachmentContentType declaredContentType;
  final int declaredSizeBytes, revision;
  final String? declaredSha256;
  final AttachmentState state;
  final DateTime expiresAt, createdAt, updatedAt;
  final AttachmentVerification? verification;
  final AttachmentRejection? rejectionReason;
  final DateTime? removedAt;
}

enum AttachmentUploadState { uploading, processing, ready, failed }

final class AttachmentUploadProgress {
  AttachmentUploadProgress({
    required this.id,
    required this.state,
    required this.bytesTransferred,
    required this.totalBytes,
  }) {
    AttachmentPolicy.validateSize(totalBytes);
    if (bytesTransferred < 0 || bytesTransferred > totalBytes) {
      throw ArgumentError('Invalid upload progress.');
    }
  }
  final AttachmentId id;
  final AttachmentUploadState state;
  final int bytesTransferred, totalBytes;
  double get fraction => bytesTransferred / totalBytes;
}

final class AttachmentBytes {
  AttachmentBytes({
    required this.owner,
    required this.id,
    required String filename,
    required AttachmentContentType contentType,
    required Uint8List bytes,
  }) : file = AttachmentFileInput(
         filename: filename,
         contentType: contentType,
         bytes: bytes,
       );
  final OwnerUid owner;
  final AttachmentId id;
  final AttachmentFileInput file;
}
