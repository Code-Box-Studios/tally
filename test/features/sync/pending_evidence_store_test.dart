import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/attachments/domain/attachment.dart';
import 'package:tally/features/sync/data/pending_evidence_native.dart';
import 'package:tally/features/sync/domain/pending_evidence.dart';

AttachmentFileInput receipt([int marker = 1, int size = 8]) =>
    AttachmentFileInput(
      filename: 'receipt.png',
      contentType: AttachmentContentType.png,
      bytes: Uint8List(size)..[0] = marker,
    );

void main() {
  late Directory root;
  late NativePendingEvidenceStore store;
  final alice = OwnerUid('alice');
  Future<NativePendingEvidenceStore> open({
    OwnerUid? owner,
    String environment = 'emulator-demo-tally',
  }) => NativePendingEvidenceStore.open(
    root: root,
    owner: owner ?? alice,
    environmentKey: environment,
  );
  setUp(() async {
    root = await Directory.systemTemp.createTemp('tally-private-receipt-');
    store = await open();
  });
  tearDown(() async {
    await store.close();
    await root.delete(recursive: true);
  });
  test(
    'native receipt and upload identities survive real IO close and reopen',
    () async {
      final saved = await store.persist(CommandId('payment-action'), receipt());
      await store.close();
      store = await open();
      final restored = (await store.get(saved.commandId))!;
      expect(restored.sha256, saved.sha256);
      expect(restored.reserveCommandId, saved.reserveCommandId);
      expect(restored.uploadCommandId, saved.uploadCommandId);
      expect((await store.readFile(saved.commandId)).sha256, saved.sha256);
      expect(store.bytesSurviveRestart, isTrue);
      expect((await store.list()).length, 1);
    },
  );
  test(
    'same command keeps its original receipt and rejects silent replacement',
    () async {
      final id = CommandId('same-payment');
      final saved = await store.persist(id, receipt());
      expect((await store.persist(id, receipt())).sha256, saved.sha256);
      await expectLater(
        store.persist(id, receipt(2)),
        throwsA(isA<PendingEvidenceFailure>()),
      );
      expect((await store.readFile(id)).sha256, saved.sha256);
    },
  );
  test('explicitly removing a receipt allows a fresh upload attempt without changing the payment', () async {
    final id = CommandId('same-accepted-payment');
    final paymentId = PaymentId('canonical-payment');
    final first = await store.persist(id, receipt());
    await store.update(
      first.progress(
        phase: PendingEvidencePhase.readyToUpload,
        paymentId: paymentId,
      ),
    );
    await store.remove(id);
    final next = await store.persist(id, receipt());
    expect(next.reserveCommandId, isNot(first.reserveCommandId));
    expect(next.uploadCommandId, isNot(first.uploadCommandId));
    expect(next.commandId, first.commandId);
    expect(next.sha256, first.sha256);
    await store.update(
      next.progress(
        phase: PendingEvidencePhase.readyToUpload,
        paymentId: paymentId,
      ),
    );
    await store.close();
    store = await open();
    final reopened = (await store.get(id))!;
    expect(reopened.reserveCommandId, next.reserveCommandId);
    expect(reopened.uploadCommandId, next.uploadCommandId);
    expect(reopened.paymentId, paymentId);
    expect((await store.readFile(id)).sha256, first.sha256);
  });
  test('legacy receipt metadata keeps its original upload identities instead of inventing a new retry', () {
    final restored = PendingEvidence.fromJson({
      'schemaVersion': 1,
      'userId': 'alice',
      'commandId': 'legacy-payment',
      'filename': 'receipt.png',
      'contentType': 'image/png',
      'sizeBytes': 8,
      'sha256':
          '7c9fa136d4413fa6173637e883b6998d32e1d675f88cddff9dcbcf331820f4b8',
      'phase': 'waitingForPayment',
      'paymentId': null,
      'failureCode': null,
      'reservation': null,
    }, alice);
    expect(
      restored.reserveCommandId.value,
      'receipt-reserve-85413782185ce2ebd8725ce62cb836be0d003163ee0f63b1584fe2fb936439ce',
    );
    expect(
      restored.uploadCommandId.value,
      'receipt-upload-85413782185ce2ebd8725ce62cb836be0d003163ee0f63b1584fe2fb936439ce',
    );
    expect(
      PendingEvidence.fromJson(restored.toJson(), alice).uploadCommandId,
      restored.uploadCommandId,
    );
  });
  test(
    'unknown metadata fields cannot replace optional receipt fields silently',
    () {
      final raw = PendingEvidence.forFile(
        alice,
        CommandId('future-field'),
        receipt(),
      ).toJson();
      raw.remove('failureCode');
      raw['unknownFutureField'] = null;
      expect(
        () => PendingEvidence.fromJson(raw, alice),
        throwsA(isA<PendingEvidenceFailure>()),
      );
    },
  );
  test('reopen removes only orphaned private copies from an interrupted metadata transaction', () async {
    final kept = await store.persist(CommandId('kept'), receipt());
    final orphan = PendingEvidence.forFile(
      alice,
      CommandId('interrupted'),
      receipt(2),
    );
    final file = File(
      '${store.receiptDirectory.path}/${orphan.fileKey}.receipt',
    );
    await file.writeAsBytes(receipt(2).bytes);
    await store.close();
    store = await open();
    expect(await file.exists(), isFalse);
    expect((await store.readFile(kept.commandId)).sha256, kept.sha256);
  });
  test(
    'missing or edited private bytes fail checksum verification visibly',
    () async {
      final id = CommandId('missing-payment');
      await store.persist(id, receipt());
      final file =
          (await store.receiptDirectory
                      .list()
                      .where((entry) => entry is File)
                      .toList())
                  .single
              as File;
      await file.writeAsBytes([9, 8, 7]);
      await expectLater(
        store.readFile(id),
        throwsA(isA<PendingEvidenceFailure>()),
      );
      await file.delete();
      await expectLater(
        store.readFile(id),
        throwsA(isA<PendingEvidenceFailure>()),
      );
      expect(await store.get(id), isNotNull);
    },
  );
  test('ten 10 MiB receipts meet the 100 MiB cap; the eleventh leaves existing files intact', () async {
    for (var i = 0; i < 10; i++) {
      await store.persist(CommandId('payment-$i'), receipt(i + 1, 10485760));
    }
    expect(
      (await store.list()).fold<int>(0, (sum, item) => sum + item.sizeBytes),
      104857600,
    );
    await expectLater(
      store.persist(CommandId('too-many'), receipt()),
      throwsA(isA<PendingEvidenceFailure>()),
    );
    expect((await store.list()).length, 10);
    expect((await store.receiptDirectory.list().toList()).length, 10);
  });
  test('atomic copy failure leaves no misleading saved receipt', () async {
    await store.receiptDirectory.delete(recursive: true);
    await File(store.receiptDirectory.path)
        .writeAsString('blocks the private directory');
    await expectLater(
      store.persist(CommandId('copy-failed'), receipt()),
      throwsA(isA<PendingEvidenceFailure>()),
    );
    expect(await store.get(CommandId('copy-failed')), isNull);
  });
  test('explicit removal affects only one receipt and other owners or environments stay separate', () async {
    final id = CommandId('shared-name');
    await store.persist(id, receipt());
    await store.persist(CommandId('keep-this'), receipt(2));
    await store.close();
    final bob = await open(owner: OwnerUid('bob'));
    try {
      expect(await bob.get(id), isNull);
      await bob.persist(id, receipt(3));
    } finally {
      await bob.close();
    }
    final staging = await open(environment: 'staging-tally-staging');
    try {
      expect(await staging.get(id), isNull);
    } finally {
      await staging.close();
    }
    store = await open();
    await store.remove(id);
    expect(await store.get(id), isNull);
    expect(await store.get(CommandId('keep-this')), isNotNull);
    await store.close();
    final restoredBob = await open(owner: OwnerUid('bob'));
    try {
      expect((await restoredBob.readFile(id)).bytes.first, 3);
    } finally {
      await restoredBob.close();
    }
  });
}
