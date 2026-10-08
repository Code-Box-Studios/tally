import 'dart:convert';

import 'package:crypto/crypto.dart';

import '../../../core/identifiers/command_id_factory.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../attachments/domain/attachment.dart';
import '../../attachments/domain/attachment_policy.dart';

enum PendingEvidencePhase {
  waitingForPayment,
  readyToUpload,
  processing,
  needsReview,
}

enum PendingEvidenceFailureCode {
  unavailable,
  quota,
  changedFile,
  reselect,
  ownership,
  conflict,
  unsupportedSchema,
}

final class PendingEvidenceFailure implements Exception {
  const PendingEvidenceFailure(this.code);
  final PendingEvidenceFailureCode code;
  String get message => switch (code) {
    PendingEvidenceFailureCode.quota => 'Receipt storage is full. Your payment is still saved. Remove an old pending receipt or choose it again later.',
    PendingEvidenceFailureCode.reselect => 'Choose the original receipt again. This browser does not retain receipt bytes after reopening.',
    PendingEvidenceFailureCode.changedFile => 'The receipt is missing or changed. Your payment is still saved. Choose the original file again.',
    PendingEvidenceFailureCode.ownership =>
      'Sign in to the same account to manage this receipt.',
    PendingEvidenceFailureCode.conflict => 'This payment already has a different pending receipt. Remove that pending receipt before choosing another.',
    PendingEvidenceFailureCode.unsupportedSchema => 'This receipt storage needs a compatible Tally version. Your saved history is preserved.',
    PendingEvidenceFailureCode.unavailable => 'Could not keep this receipt. Your payment is still saved. Choose the file again later.',
  };
  @override
  String toString() => message;
}

/// Local evidence is independent of the immutable financial action and balance.
final class PendingEvidence {
  PendingEvidence._({
    required this.owner,
    required this.commandId,
    required this.filename,
    required this.contentType,
    required this.sizeBytes,
    required this.sha256,
    required this.receiptAttemptId,
    this.phase = PendingEvidencePhase.waitingForPayment,
    this.paymentId,
    this.reservation,
    this.failureCode,
  }) {
    AttachmentPolicy.validateFilename(filename);
    AttachmentPolicy.validateSize(sizeBytes);
    AttachmentPolicy.validateSha256(sha256);
    if (sha256.length != 64 ||
        reservation != null && reservation!.owner != owner ||
        reservation != null && paymentId == null ||
        phase != PendingEvidencePhase.waitingForPayment && paymentId == null) {
      throw const PendingEvidenceFailure(
        PendingEvidenceFailureCode.unsupportedSchema,
      );
    }
  }
  factory PendingEvidence.forFile(
    OwnerUid owner,
    CommandId commandId,
    AttachmentFileInput file,
  ) => PendingEvidence._(
    owner: owner,
    commandId: commandId,
    filename: file.filename,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    sha256: file.sha256,
    receiptAttemptId: newCommandId(),
  );
  final OwnerUid owner;
  final CommandId commandId;
  // Null identifies the original metadata format. Its existing retry IDs stay
  // unchanged; a new selection after explicit removal receives a new attempt.
  final CommandId? receiptAttemptId;
  final String filename, sha256;
  final AttachmentContentType contentType;
  final int sizeBytes;
  final PendingEvidencePhase phase;
  final PaymentId? paymentId;
  final AttachmentReservation? reservation;
  final String? failureCode;
  String get fileKey => sha256Digest([
    owner.value,
    commandId.value,
    filename,
    contentType.mime,
    sizeBytes,
    sha256,
    if (receiptAttemptId != null) receiptAttemptId!.value,
  ]);
  CommandId get reserveCommandId => CommandId('receipt-reserve-$fileKey');
  CommandId get uploadCommandId => CommandId('receipt-upload-$fileKey');
  bool matchesFile(AttachmentFileInput file) =>
      filename == file.filename &&
      contentType == file.contentType &&
      sizeBytes == file.sizeBytes &&
      sha256 == file.sha256;
  PendingEvidence progress({
    required PendingEvidencePhase phase,
    PaymentId? paymentId,
    AttachmentReservation? reservation,
    String? failureCode,
  }) => PendingEvidence._(
    owner: owner,
    commandId: commandId,
    filename: filename,
    contentType: contentType,
    sizeBytes: sizeBytes,
    sha256: sha256,
    receiptAttemptId: receiptAttemptId,
    phase: phase,
    paymentId: paymentId ?? this.paymentId,
    reservation: reservation ?? this.reservation,
    failureCode: failureCode,
  );
  Map<String, Object?> toJson() => {
    'schemaVersion': receiptAttemptId == null ? 1 : 2,
    'userId': owner.value,
    'commandId': commandId.value,
    if (receiptAttemptId != null) 'receiptAttemptId': receiptAttemptId!.value,
    'filename': filename,
    'contentType': contentType.mime,
    'sizeBytes': sizeBytes,
    'sha256': sha256,
    'phase': phase.name,
    'paymentId': paymentId?.value,
    'failureCode': failureCode,
    'reservation': reservation == null
        ? null
        : {
            'id': reservation!.id.value,
            'revision': reservation!.revision,
            'storagePath': reservation!.storagePath,
            'expiresAt': reservation!.expiresAt.toIso8601String(),
          },
  };
  factory PendingEvidence.fromJson(Map<String, Object?> raw, OwnerUid owner) {
    try {
      final version = raw['schemaVersion'];
      final fields = {
        'schemaVersion',
        'userId',
        'commandId',
        'filename',
        'contentType',
        'sizeBytes',
        'sha256',
        'phase',
        'paymentId',
        'failureCode',
        'reservation',
        if (version == 2) 'receiptAttemptId',
      };
      if (version != 1 && version != 2 ||
          raw['userId'] != owner.value ||
          raw.length != fields.length ||
          !fields.every(raw.containsKey)) {
        throw const FormatException();
      }
      final reservation = raw['reservation'];
      if (reservation != null &&
          (reservation is! Map || reservation.length != 4)) {
        throw const FormatException();
      }
      return PendingEvidence._(
        owner: owner,
        commandId: CommandId(raw['commandId'] as String),
        receiptAttemptId: version == 1
            ? null
            : CommandId(raw['receiptAttemptId'] as String),
        filename: raw['filename'] as String,
        contentType: AttachmentContentType.parse(raw['contentType'] as String),
        sizeBytes: raw['sizeBytes'] as int,
        sha256: raw['sha256'] as String,
        phase: PendingEvidencePhase.values.byName(raw['phase'] as String),
        paymentId: raw['paymentId'] == null
            ? null
            : PaymentId(raw['paymentId'] as String),
        failureCode: raw['failureCode'] as String?,
        reservation: reservation == null
            ? null
            : AttachmentReservation(
                owner: owner,
                id: AttachmentId((reservation as Map)['id'] as String),
                revision: reservation['revision'] as int,
                storagePath: reservation['storagePath'] as String,
                expiresAt: DateTime.parse(reservation['expiresAt'] as String),
              ),
      );
    } catch (_) {
      throw const PendingEvidenceFailure(
        PendingEvidenceFailureCode.unsupportedSchema,
      );
    }
  }
}

String sha256Digest(List<Object?> values) =>
    sha256.convert(utf8.encode(jsonEncode(values))).toString();
