import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/attachments/domain/attachment.dart';
import 'package:tally/features/attachments/domain/attachment_policy.dart';

void main() {
  test('declared file size is positive and bounded at exactly ten MiB', () {
    for (final size in [0, -1, 10485761]) {
      expect(() => AttachmentPolicy.validateSize(size), throwsArgumentError);
    }
    AttachmentPolicy.validateSize(10485760);
    expect(AttachmentPolicy.maxBytes, 10485760);
    expect(AttachmentPolicy.maxActivePerTarget, 10);
  });

  test('MIME types use stable strings and exclude HTML and SVG', () {
    for (final mime in [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ]) {
      expect(AttachmentContentType.parse(mime).mime, mime);
    }
    for (final mime in [
      'image/svg+xml',
      'text/html',
      'application/octet-stream',
      'IMAGE/PNG',
    ]) {
      expect(() => AttachmentContentType.parse(mime), throwsArgumentError);
    }
  });

  test(
    'filenames are display values and reject controls and traversal paths',
    () {
      for (final filename in [
        '',
        ' ',
        '.',
        '..',
        '../receipt.pdf',
        r'folder\receipt.pdf',
        'a\n.png',
        'a\u202e.png',
        'a' * 151,
      ]) {
        expect(
          () => AttachmentPolicy.validateFilename(filename),
          throwsArgumentError,
        );
      }
      AttachmentPolicy.validateFilename('Agreement — October.pdf');
      AttachmentPolicy.validateFilename('a' * 150);
    },
  );

  test('optional SHA-256 is canonical lowercase hex', () {
    AttachmentPolicy.validateSha256(null);
    AttachmentPolicy.validateSha256('ab' * 32);
    for (final checksum in ['ab' * 31, 'AB' * 32, 'x' * 64]) {
      expect(
        () => AttachmentPolicy.validateSha256(checksum),
        throwsArgumentError,
      );
    }
  });

  test('targets keep strongly typed identities and canonical owned paths', () {
    final obligation = AttachmentTarget.forObligation(ObligationId('loan-1'));
    final instance = AttachmentTarget.forInstance(InstanceId('period-1'));
    final payment = AttachmentTarget.forPayment(PaymentId('payment-1'));
    expect(obligation.type.name, 'obligation');
    expect(instance.type.name, 'instance');
    expect(payment.type.name, 'payment');
    expect(obligation.id, 'loan-1');
    expect(AttachmentTarget.fromStored('payment', 'payment-1'), payment);
    expect(
      attachmentStoragePath(OwnerUid('alice'), AttachmentId('file-1')),
      'users/alice/attachments/file-1/content',
    );
    expect(
      () => AttachmentTarget.fromStored('unknown', 'one'),
      throwsArgumentError,
    );
    expect(
      () => AttachmentTarget.fromStored('payment', '../one'),
      throwsA(anything),
    );
  });

  test('selected bytes are immutable and checksum follows the owned copy', () {
    final source = Uint8List.fromList([1, 2, 3]);
    final file = AttachmentFileInput(
      filename: 'receipt.png',
      contentType: AttachmentContentType.png,
      bytes: source,
    );
    source[0] = 9;
    expect(file.bytes, [1, 2, 3]);
    expect(() => file.bytes[0] = 7, throwsUnsupportedError);
    expect(
      file.sha256,
      '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
    );
    expect(
      () => AttachmentFileInput(
        filename: 'empty.png',
        contentType: AttachmentContentType.png,
        bytes: Uint8List(0),
      ),
      throwsArgumentError,
    );
  });

  test(
    'reservation payload contains only typed target and declared file metadata',
    () {
      final value = AttachmentReservationInput(
        target: AttachmentTarget.forPayment(PaymentId('payment-1')),
        filename: 'receipt.pdf',
        contentType: AttachmentContentType.pdf,
        sizeBytes: 123,
        sha256: null,
      );
      expect(value.toPayload(), {
        'targetType': 'payment',
        'targetId': 'payment-1',
        'filename': 'receipt.pdf',
        'contentType': 'application/pdf',
        'sizeBytes': 123,
        'sha256': null,
      });
    },
  );
}
