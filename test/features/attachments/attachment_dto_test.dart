import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/attachments/data/attachment_dto.dart';
import 'package:tally/features/attachments/domain/attachment.dart';

final owner = OwnerUid('alice');
Map<String, Object?> record() => {
  'attachmentId': 'file-1',
  'userId': 'alice',
  'schemaVersion': 1,
  'targetType': 'payment',
  'targetId': 'payment-1',
  'obligationId': 'loan-1',
  'storagePath': 'users/alice/attachments/file-1/content',
  'filename': 'receipt.pdf',
  'declaredContentType': 'application/pdf',
  'declaredSizeBytes': 100,
  'declaredSha256': null,
  'state': 'awaitingUpload',
  'revision': 1,
  'expiresAt': DateTime.utc(2026, 10, 7),
  'contentType': null,
  'sizeBytes': null,
  'sha256': null,
  'storageGeneration': null,
  'finalizedAt': null,
  'rejectionReason': null,
  'removedAt': null,
  'createdAt': DateTime.utc(2026, 10, 6),
  'updatedAt': DateTime.utc(2026, 10, 6),
};
Map<String, Object?> ready() => {
  ...record(),
  'state': 'ready',
  'contentType': 'application/pdf',
  'sizeBytes': 100,
  'sha256': 'ab' * 32,
  'storageGeneration': '18446744073709551615',
  'finalizedAt': DateTime.utc(2026, 10, 6),
};

void main() {
  test('reserved metadata maps without fabricating a verified file', () {
    final value = AttachmentDto.fromMap('file-1', record(), owner);
    expect(value.state, AttachmentState.awaitingUpload);
    expect(value.target, AttachmentTarget.forPayment(PaymentId('payment-1')));
    expect(value.verification, isNull);
  });
  test('ready generation remains an opaque string above MAX_SAFE_INTEGER', () {
    final value = AttachmentDto.fromMap('file-1', ready(), owner);
    expect(value.verification!.storageGeneration, '18446744073709551615');
    expect(value.verification!.sizeBytes, 100);
  });
  for (final patch in <Map<String, Object?>>[
    {'userId': 'bob'},
    {'attachmentId': 'other'},
    {'schemaVersion': 2},
    {'targetType': 'account'},
    {'targetId': '../payment'},
    {'obligationId': '../loan'},
    {'storagePath': 'users/bob/attachments/file-1/content'},
    {'state': 'unknown'},
    {'declaredSizeBytes': 0},
    {'declaredSizeBytes': 10485761},
    {'declaredContentType': 'text/html'},
    {'revision': 0},
    {'createdAt': null},
  ]) {
    test('strict metadata rejects ${patch.keys.single}', () {
      expect(
        () => AttachmentDto.fromMap('file-1', {...record(), ...patch}, owner),
        throwsA(anything),
      );
    });
  }
  test(
    'ready state requires a complete verified tuple and finalization instant',
    () {
      for (final field in [
        'contentType',
        'sizeBytes',
        'sha256',
        'storageGeneration',
        'finalizedAt',
      ]) {
        expect(
          () =>
              AttachmentDto.fromMap('file-1', {...ready(), field: null}, owner),
          throwsA(anything),
        );
      }
      expect(
        () => AttachmentDto.fromMap('file-1', {
          ...ready(),
          'storageGeneration': 42,
        }, owner),
        throwsA(anything),
      );
      expect(
        () => AttachmentDto.fromMap('file-1', {
          ...record(),
          'sha256': 'ab' * 32,
        }, owner),
        throwsA(anything),
      );
    },
  );
  test('removed evidence preserves complete historical verification', () {
    final value = AttachmentDto.fromMap('file-1', {
      ...ready(),
      'state': 'deleted',
      'removedAt': DateTime.utc(2026, 10, 6, 1),
    }, owner);
    expect(value.state, AttachmentState.deleted);
    expect(value.verification, isNotNull);
    expect(
      () => AttachmentDto.fromMap('file-1', {
        ...record(),
        'state': 'deleted',
      }, owner),
      throwsA(anything),
    );
  });
  test(
    'reservation callable response has a checked path and canonical UTC expiry',
    () {
      final result = {
        'attachmentId': 'file-1',
        'revision': 1,
        'storagePath': 'users/alice/attachments/file-1/content',
        'expiresAt': '2026-10-07T00:00:00.000Z',
      };
      expect(
        AttachmentDto.reservation(result, owner).expiresAt,
        DateTime.utc(2026, 10, 7),
      );
      for (final patch in [
        {'storagePath': 'users/bob/attachments/file-1/content'},
        {'expiresAt': '2026-10-07T08:00:00.000+08:00'},
        {'expiresAt': '2026-02-31T00:00:00.000Z'},
        {'expiresAt': '2026-10-07'},
      ]) {
        expect(
          () => AttachmentDto.reservation({...result, ...patch}, owner),
          throwsA(anything),
        );
      }
    },
  );
}
