import 'dart:async';
import 'dart:typed_data';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/attachments/data/firebase_attachment_storage.dart';
import 'package:tally/features/attachments/data/firebase_attachments_repository.dart';
import 'package:tally/features/attachments/domain/attachment.dart';
import 'package:tally/shared/data/owner_command_gateway.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';
import 'package:tally/shared/domain/data_page.dart';
import 'package:tally/shared/domain/financial_failure.dart';

import 'attachment_dto_test.dart' show record;

const contentHash =
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

final class TestFileCursor implements PageCursor {}

class FileDocuments implements OwnerDocumentGateway {
  FileDocuments(this.owner);
  @override
  final OwnerUid owner;
  final pages = <RawPage>[];
  final queries = <DocumentQuery>[];
  Map<String, Object?> data = {...record(), 'declaredSizeBytes': 3};
  Completer<RawRecord>? pendingRecord;
  @override
  Stream<RawPage> watchPage(DocumentQuery query) => Stream.value(_page(query));
  RawPage _page(DocumentQuery query) {
    queries.add(query);
    return pages.removeAt(0);
  }

  @override
  Future<RawPage> getPage(DocumentQuery query) async => _page(query);
  @override
  Stream<RawRecord> watchDocument(String collection, String id) =>
      pendingRecord == null
      ? Stream.value(RawRecord(RawDocument(id, data), isFromCache: false))
      : Stream.fromFuture(pendingRecord!.future);
  void ready() {
    data = {
      ...data,
      'state': 'ready',
      'contentType': 'application/pdf',
      'sizeBytes': 3,
      'sha256': contentHash,
      'storageGeneration': '18446744073709551615',
      'finalizedAt': DateTime.utc(2026, 10, 6),
    };
  }
}

class FileCommands implements OwnerCommandGateway {
  FileCommands(this.owner);
  @override
  final OwnerUid owner;
  final calls = <(String, CommandId, Map<String, Object?>)>[];
  bool loseUpload = false;
  Completer<Map<String, Object?>>? pending;
  @override
  Future<Map<String, Object?>> call(
    String name,
    CommandId id,
    Map<String, Object?> payload,
  ) async {
    calls.add((name, id, Map.of(payload)));
    if (pending != null) return pending!.future;
    if (name == 'reserveAttachment') {
      return {
        'attachmentId': 'file-1',
        'revision': 1,
        'storagePath': 'users/${owner.value}/attachments/file-1/content',
        'expiresAt': '2100-10-07T00:00:00.000Z',
      };
    }
    if (name == 'uploadAttachment') {
      if (loseUpload) {
        loseUpload = false;
        throw FirebaseException(plugin: 'cloud_functions', code: 'unavailable');
      }
      return {
        'attachmentId': 'file-1',
        'storageGeneration': '18446744073709551615',
      };
    }
    return {'attachmentId': 'file-1', 'revision': 2, 'state': 'deleted'};
  }
}

class FileStorage implements AttachmentStorageGateway {
  FileStorage(this.owner);
  @override
  final OwnerUid owner;
  final reads = <(String, int)>[];
  Uint8List bytes = Uint8List.fromList([97, 98, 99]);
  Completer<Uint8List>? pending;
  Completer<void>? pendingDispose;
  @override
  Future<Uint8List> download(String path, {required int maxBytes}) async {
    reads.add((path, maxBytes));
    return pending == null ? bytes : pending!.future;
  }

  @override
  Future<void> dispose() async {
    await pendingDispose?.future;
  }
}

AttachmentFileInput selected() => AttachmentFileInput(
  filename: 'receipt.pdf',
  contentType: AttachmentContentType.pdf,
  bytes: Uint8List.fromList([97, 98, 99]),
);
AttachmentReservation reservation(OwnerUid owner) => AttachmentReservation(
  owner: owner,
  id: AttachmentId('file-1'),
  revision: 1,
  storagePath: 'users/${owner.value}/attachments/file-1/content',
  expiresAt: DateTime.utc(2100, 10, 7),
);

void main() {
  final owner = OwnerUid('alice'),
      target = AttachmentTarget.forPayment(PaymentId('payment-1'));
  test('target pages preserve cache truth and reject another owner or target cursor', () async {
    final docs = FileDocuments(owner)
      ..pages.addAll([
        RawPage(
          documents: [RawDocument('file-1', record())],
          nextCursor: TestFileCursor(),
          hasMore: true,
          isFromCache: true,
        ),
        RawPage(
          documents: [],
          nextCursor: null,
          hasMore: false,
          isFromCache: false,
        ),
      ]);
    final repo = FirebaseAttachmentsRepository(
      docs,
      FileCommands(owner),
      FileStorage(owner),
    );
    final first = await repo.watchTarget(target).first;
    expect(first.items.single.target, target);
    expect(first.isFromCache, isTrue);
    expect(docs.queries.single.equals, {
      'targetType': 'payment',
      'targetId': 'payment-1',
    });
    expect(docs.queries.single.limit, 50);
    expect(docs.queries.single.order.single.field, 'createdAt');
    expect(docs.queries.single.order.single.descending, isTrue);
    await expectLater(
      repo.getTarget(
        AttachmentTarget.forPayment(PaymentId('other')),
        after: first.nextCursor,
      ),
      throwsArgumentError,
    );
    final other = OwnerUid('bob');
    await expectLater(
      FirebaseAttachmentsRepository(
        FileDocuments(other),
        FileCommands(other),
        FileStorage(other),
      ).getTarget(target, after: first.nextCursor),
      throwsArgumentError,
    );
    final next = await repo.getTarget(target, after: first.nextCursor);
    expect(next.isFromCache, isFalse);
    expect(next.items, isEmpty);
  });
  test('a forged page target is rejected instead of appearing in another payment history', () async {
    final docs = FileDocuments(owner)
      ..pages.add(
        RawPage(
          documents: [
            RawDocument('file-1', {...record(), 'targetId': 'another-payment'}),
          ],
          nextCursor: null,
          hasMore: false,
          isFromCache: false,
        ),
      );
    await expectLater(
      FirebaseAttachmentsRepository(
        docs,
        FileCommands(owner),
        FileStorage(owner),
      ).watchTarget(target).first,
      throwsA(isA<FinancialFailure>()),
    );
  });
  test('upload retries reconcile the same frozen command and bytes after a lost response', () async {
    final commands = FileCommands(owner)..loseUpload = true,
        repo = FirebaseAttachmentsRepository(
          FileDocuments(owner),
          commands,
          FileStorage(owner),
        );
    await expectLater(
      repo.upload(reservation(owner), selected()).toList(),
      throwsA(isA<FinancialFailure>()),
    );
    final result = await repo.upload(reservation(owner), selected()).toList();
    expect(result.first.state, AttachmentUploadState.uploading);
    expect(result.last.state, AttachmentUploadState.processing);
    expect(commands.calls[0].$2, commands.calls[1].$2);
    expect(commands.calls[0].$3, commands.calls[1].$3);
    expect(commands.calls.last.$3, {
      'attachmentId': 'file-1',
      'expectedRevision': 1,
      'contentBase64': 'YWJj',
    });
    await expectLater(
      repo
          .upload(
            reservation(owner),
            AttachmentFileInput(
              filename: 'receipt.pdf',
              contentType: AttachmentContentType.pdf,
              bytes: Uint8List.fromList([97, 98, 100]),
            ),
          )
          .toList(),
      throwsA(anything),
    );
    expect(commands.calls.length, 2);
  });
  test('ready download is capped and verified against the private metadata checksum', () async {
    final docs = FileDocuments(owner)..ready(),
        storage = FileStorage(owner),
        repo = FirebaseAttachmentsRepository(
          docs,
          FileCommands(owner),
          storage,
        );
    final bytes = await repo.download(AttachmentId('file-1'));
    expect(bytes.owner, owner);
    expect(bytes.file.bytes, [97, 98, 99]);
    expect(storage.reads.single, (
      'users/alice/attachments/file-1/content',
      10485760,
    ));
    storage.bytes = Uint8List.fromList([97, 98, 100]);
    await expectLater(
      repo.download(AttachmentId('file-1')),
      throwsA(isA<FinancialFailure>()),
    );
    docs.data = {...docs.data, 'state': 'processing'};
    await expectLater(repo.download(AttachmentId('file-1')), throwsA(anything));
    expect(storage.reads.length, 2);
  });
  test(
    'foreign metadata and reservations never reach file transport',
    () async {
      final docs = FileDocuments(owner)..ready(),
          storage = FileStorage(owner),
          repo = FirebaseAttachmentsRepository(
            docs,
            FileCommands(owner),
            storage,
          );
      docs.data = {...docs.data, 'userId': 'bob'};
      await expectLater(
        repo.download(AttachmentId('file-1')),
        throwsA(anything),
      );
      expect(storage.reads, isEmpty);
      await expectLater(
        repo.upload(reservation(OwnerUid('bob')), selected()).toList(),
        throwsA(anything),
      );
      expect(
        () => FirebaseAttachmentsRepository(
          docs,
          FileCommands(owner),
          FileStorage(OwnerUid('bob')),
        ),
        throwsArgumentError,
      );
    },
  );
  test('owner disposal rejects late upload and download without waiting for transport', () async {
    final commands = FileCommands(owner)..pending = Completer(),
        docs = FileDocuments(owner)..ready(),
        storage = FileStorage(owner)..pending = Completer();
    final repo = FirebaseAttachmentsRepository(docs, commands, storage),
        upload = repo.upload(reservation(owner), selected()).toList(),
        download = repo.download(AttachmentId('file-1'));
    final uploading = expectLater(upload, throwsA(isA<FinancialFailure>())),
        downloading = expectLater(download, throwsA(isA<FinancialFailure>()));
    await Future<void>.delayed(Duration.zero);
    await repo.dispose().timeout(const Duration(milliseconds: 200));
    await uploading;
    await downloading;
    commands.pending!.complete({
      'attachmentId': 'file-1',
      'storageGeneration': '1',
    });
    storage.pending!.complete(Uint8List.fromList([97, 98, 99]));
    await Future<void>.delayed(Duration.zero);
    await expectLater(
      repo.reserve(
        CommandId('late'),
        AttachmentReservationInput(
          target: target,
          filename: 'receipt.pdf',
          contentType: AttachmentContentType.pdf,
          sizeBytes: 3,
        ),
      ),
      throwsA(anything),
    );
  });
  test(
    'session cleanup is bounded even when a platform disposal never responds',
    () async {
      final storage = FileStorage(owner)..pendingDispose = Completer(),
          repo = FirebaseAttachmentsRepository(
            FileDocuments(owner),
            FileCommands(owner),
            storage,
          );
      await repo.dispose().timeout(const Duration(seconds: 2));
      storage.pendingDispose!.complete();
    },
  );
}
