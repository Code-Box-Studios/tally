import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/attachments/domain/attachment.dart';
import 'package:tally/features/attachments/domain/attachments_repository.dart';
import 'package:tally/features/sync/data/pending_evidence_native.dart';
import 'package:tally/features/sync/domain/pending_evidence.dart';
import 'package:tally/features/sync/presentation/pending_evidence_coordinator.dart';
import 'package:tally/shared/domain/data_page.dart';
import 'package:tally/shared/domain/financial_failure.dart';

import 'pending_evidence_store_test.dart' show receipt;

class ReceiptRepository implements AttachmentsRepository {
  @override
  final owner = OwnerUid('alice');
  final reserveIds = <CommandId>[], uploadIds = <CommandId>[];
  final changes = StreamController<void>.broadcast();
  AttachmentReservationInput? input;
  bool loseReserve = false,
      loseUpload = false,
      rejected = false,
      ready = false,
      cached = false;
  Completer<AttachmentReservation>? held;
  AttachmentReservation get reservation => AttachmentReservation(
    owner: owner,
    id: AttachmentId('receipt-1'),
    revision: 1,
    storagePath: 'users/alice/attachments/receipt-1/content',
    expiresAt: DateTime.utc(2027),
  );
  @override
  Future<AttachmentReservation> reserve(
    CommandId id,
    AttachmentReservationInput value,
  ) async {
    reserveIds.add(id);
    input = value;
    if (held != null) return held!.future;
    if (loseReserve) {
      loseReserve = false;
      throw const FinancialFailure(
        FinancialFailureCode.offline,
        'Lost receipt reservation response.',
      );
    }
    return reservation;
  }

  @override
  Stream<AttachmentUploadProgress> upload(
    AttachmentReservation reservation,
    AttachmentFileInput file, {
    CommandId? commandId,
  }) async* {
    uploadIds.add(commandId!);
    if (loseUpload) {
      loseUpload = false;
      throw const FinancialFailure(
        FinancialFailureCode.offline,
        'Lost upload response.',
      );
    }
    yield AttachmentUploadProgress(
      id: reservation.id,
      state: AttachmentUploadState.processing,
      bytesTransferred: file.sizeBytes,
      totalBytes: file.sizeBytes,
    );
  }

  DataPage<Attachment> page(AttachmentTarget target) => DataPage(
    items: input == null
        ? []
        : [
            Attachment(
              id: AttachmentId('receipt-1'),
              owner: owner,
              target: target,
              obligationId: ObligationId('loan'),
              storagePath: 'users/alice/attachments/receipt-1/content',
              filename: input!.filename,
              declaredContentType: input!.contentType,
              declaredSizeBytes: input!.sizeBytes,
              declaredSha256: input!.sha256,
              state: rejected
                  ? AttachmentState.rejected
                  : ready
                  ? AttachmentState.ready
                  : AttachmentState.processing,
              revision: 2,
              expiresAt: DateTime.utc(2027),
              createdAt: DateTime.utc(2026),
              updatedAt: DateTime.utc(2026),
              rejectionReason: rejected
                  ? AttachmentRejection.unsupportedFormat
                  : null,
              verification: ready
                  ? AttachmentVerification(
                      contentType: input!.contentType,
                      sizeBytes: input!.sizeBytes,
                      sha256: input!.sha256!,
                      storageGeneration: '1',
                      finalizedAt: DateTime.utc(2026),
                    )
                  : null,
            ),
          ],
    nextCursor: null,
    hasMore: false,
    isFromCache: cached,
  );
  @override
  Future<DataPage<Attachment>> getTarget(
    AttachmentTarget target, {
    PageCursor? after,
  }) async => page(target);
  @override
  Stream<DataPage<Attachment>> watchTarget(AttachmentTarget target) async* {
    yield page(target);
    yield* changes.stream.map((_) => page(target));
  }

  @override
  Future<AttachmentBytes> download(AttachmentId id) =>
      throw UnimplementedError();
  @override
  Future<int> remove(
    CommandId command,
    AttachmentId id, {
    required int expectedRevision,
  }) => throw UnimplementedError();
  @override
  Future<void> dispose() async {}
}

void main() {
  late Directory root;
  late NativePendingEvidenceStore store;
  late ReceiptRepository files;
  late PendingEvidenceCoordinator coordinator;
  PaymentId? accepted;
  var active = true;
  final id = CommandId('payment-action');
  Future<void> reopen() async {
    await coordinator.dispose();
    await store.close();
    store = await NativePendingEvidenceStore.open(
      root: root,
      owner: files.owner,
      environmentKey: 'emulator-demo-tally',
    );
    coordinator = PendingEvidenceCoordinator(
      store: store,
      attachments: files,
      resolvePayment: (_) async => accepted,
      isOwnerActive: () => active,
    );
  }

  setUp(() async {
    root = await Directory.systemTemp.createTemp('tally-receipt-coordinator-');
    files = ReceiptRepository();
    accepted = null;
    active = true;
    store = await NativePendingEvidenceStore.open(
      root: root,
      owner: files.owner,
      environmentKey: 'emulator-demo-tally',
    );
    coordinator = PendingEvidenceCoordinator(
      store: store,
      attachments: files,
      resolvePayment: (_) async => accepted,
      isOwnerActive: () => active,
    );
  });
  tearDown(() async {
    await coordinator.dispose();
    await store.close();
    await files.changes.close();
    await root.delete(recursive: true);
  });
  test('a queued payment cannot reserve or upload; publication alone removes its local receipt', () async {
    await coordinator.stage(id, receipt());
    await coordinator.reconcile();
    expect(files.reserveIds, isEmpty);
    expect(files.uploadIds, isEmpty);
    accepted = PaymentId('canonical-payment');
    await coordinator.reconcile();
    expect(files.input!.target, AttachmentTarget.forPayment(accepted!));
    expect((await store.get(id))!.phase, PendingEvidencePhase.processing);
    expect(await store.readFile(id), isNotNull);
    files.ready = true;
    files.changes.add(null);
    for (var i = 0; i < 30 && await store.get(id) != null; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 20));
    }
    expect(await store.get(id), isNull);
    expect(files.reserveIds.length, 1);
    expect(files.uploadIds.length, 1);
  });
  test('cached ready metadata cannot erase receipt bytes before fresh publication is verified', () async {
    await coordinator.stage(id, receipt());
    accepted = PaymentId('canonical-payment');
    files.ready = true;
    files.cached = true;
    await coordinator.reconcile();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(await store.get(id), isNotNull);
    expect(await store.readFile(id), isNotNull);
    files.cached = false;
    files.changes.add(null);
    for (var i = 0; i < 30 && await store.get(id) != null; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 20));
    }
    expect(await store.get(id), isNull);
  });
  test('lost reserve and upload responses across reopen keep the exact original identities and file', () async {
    await coordinator.stage(id, receipt());
    accepted = PaymentId('canonical-payment');
    files.loseReserve = true;
    await coordinator.reconcile();
    final first = (await store.get(id))!;
    expect(first.phase, PendingEvidencePhase.needsReview);
    await reopen();
    files.loseUpload = true;
    await coordinator.reconcile(retry: id);
    expect(files.reserveIds, [first.reserveCommandId, first.reserveCommandId]);
    expect((await store.get(id))!.reservation!.id.value, 'receipt-1');
    await reopen();
    await coordinator.reconcile(retry: id);
    expect(files.uploadIds, [first.uploadCommandId, first.uploadCommandId]);
    expect((await store.readFile(id)).sha256, first.sha256);
    expect(accepted!.value, 'canonical-payment');
  });
  test('server rejection retains the copied receipt and never changes the accepted payment identity', () async {
    await coordinator.stage(id, receipt());
    accepted = PaymentId('canonical-payment');
    await coordinator.reconcile();
    files.rejected = true;
    files.changes.add(null);
    for (
      var i = 0;
      i < 30 &&
          (await store.get(id))!.phase != PendingEvidencePhase.needsReview;
      i++
    ) {
      await Future<void>.delayed(const Duration(milliseconds: 20));
    }
    expect((await store.get(id))!.phase, PendingEvidencePhase.needsReview);
    expect((await store.get(id))!.paymentId, accepted);
    expect(await store.readFile(id), isNotNull);
    await coordinator.cancel(id);
    expect(await store.get(id), isNull);
  });
  test(
    'owner disposal stops a held reservation before any upload can start',
    () async {
      await coordinator.stage(id, receipt());
      accepted = PaymentId('canonical-payment');
      files.held = Completer();
      final work = coordinator.reconcile();
      while (files.reserveIds.isEmpty) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
      active = false;
      await coordinator.dispose();
      files.held!.complete(files.reservation);
      await work;
      expect(files.uploadIds, isEmpty);
      expect(await store.get(id), isNotNull);
      await expectLater(
        coordinator.stage(CommandId('late'), receipt()),
        throwsA(isA<PendingEvidenceFailure>()),
      );
    },
  );
}
