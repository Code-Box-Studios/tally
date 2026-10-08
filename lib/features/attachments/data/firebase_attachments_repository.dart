import 'dart:async';
import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;

import '../../../core/identifiers/command_id_factory.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/data/document_reader.dart';
import '../../../shared/data/financial_failure_mapper.dart';
import '../../../shared/data/financial_repository_base.dart';
import '../../../shared/data/owner_document_gateway.dart';
import '../../../shared/domain/data_page.dart';
import '../../../shared/domain/financial_failure.dart';
import '../domain/attachment.dart';
import '../domain/attachment_policy.dart';
import '../domain/attachments_repository.dart';
import 'attachment_dto.dart';
import 'firebase_attachment_storage.dart';

final class _TargetCursor implements PageCursor {
  const _TargetCursor(this.owner, this.target, this.raw);
  final OwnerUid owner;
  final AttachmentTarget target;
  final PageCursor raw;
}

final class _UploadAttempt {
  const _UploadAttempt(this.command, this.fingerprint);
  final CommandId command;
  final String fingerprint;
}

final class FirebaseAttachmentsRepository extends FinancialRepositoryBase
    implements AttachmentsRepository {
  FirebaseAttachmentsRepository(super.documents, super.commands, this.storage) {
    if (storage.owner != owner) {
      throw ArgumentError('File repository owners must match.');
    }
  }
  final AttachmentStorageGateway storage;
  final _cancelWork = <void Function()>{};
  final _uploads = <AttachmentId, _UploadAttempt>{};
  bool _closed = false;
  void _check() {
    if (_closed) {
      throw const FinancialFailure(
        FinancialFailureCode.signIn,
        'Your sign-in changed.',
      );
    }
  }

  Future<T> _owned<T>(Future<T> work) async {
    _check();
    final cancelled = Completer<T>();
    void cancel() => cancelled.completeError(
      const FinancialFailure(
        FinancialFailureCode.signIn,
        'Your sign-in changed.',
      ),
    );
    _cancelWork.add(cancel);
    try {
      final value = await Future.any<T>([work, cancelled.future]);
      _check();
      return value;
    } finally {
      _cancelWork.remove(cancel);
    }
  }

  DocumentQuery _query(AttachmentTarget target, PageCursor? after) {
    _check();
    if (after != null &&
        (after is! _TargetCursor ||
            after.owner != owner ||
            after.target != target)) {
      throw ArgumentError('Invalid private file cursor.');
    }
    return DocumentQuery(
      'attachments',
      limit: 50,
      after: (after as _TargetCursor?)?.raw,
      equals: {'targetType': target.type.name, 'targetId': target.id},
      order: const [DocumentOrder('createdAt', descending: true)],
    );
  }

  Attachment _map(AttachmentTarget target, RawDocument raw) {
    _check();
    final value = AttachmentDto.fromMap(raw.id, raw.data, owner);
    if (value.target != target) throw DocumentReader.invalid();
    return value;
  }

  DataPage<Attachment> _page(
    AttachmentTarget target,
    DataPage<Attachment> page,
  ) => DataPage(
    items: page.items,
    hasMore: page.hasMore,
    isFromCache: page.isFromCache,
    nextCursor: page.nextCursor == null
        ? null
        : _TargetCursor(owner, target, page.nextCursor!),
  );
  @override
  Stream<DataPage<Attachment>> watchTarget(AttachmentTarget target) => watch(
    _query(target, null),
    (raw) => _map(target, raw),
  ).map((page) => _page(target, page));
  @override
  Future<DataPage<Attachment>> getTarget(
    AttachmentTarget target, {
    PageCursor? after,
  }) async {
    final query = _query(target, after);
    return _page(target, await _owned(get(query, (raw) => _map(target, raw))));
  }

  @override
  Future<AttachmentReservation> reserve(
    CommandId id,
    AttachmentReservationInput input,
  ) async {
    _check();
    try {
      return AttachmentDto.reservation(
        await _owned(commands.call('reserveAttachment', id, input.toPayload())),
        owner,
      );
    } catch (error) {
      throw financialFailure(error);
    }
  }

  @override
  Stream<AttachmentUploadProgress> upload(
    AttachmentReservation reservation,
    AttachmentFileInput file, {
    CommandId? commandId,
  }) async* {
    _check();
    if (reservation.owner != owner) {
      throw ArgumentError('The file belongs to another owner.');
    }
    final fingerprint = jsonEncode([
      reservation.id.value,
      reservation.revision,
      reservation.storagePath,
      file.filename,
      file.contentType.mime,
      file.sizeBytes,
      file.sha256,
    ]);
    final attempt = _uploads.putIfAbsent(
      reservation.id,
      () => _UploadAttempt(commandId ?? newCommandId(), fingerprint),
    );
    if (attempt.fingerprint != fingerprint ||
        commandId != null && attempt.command != commandId) {
      throw ArgumentError('Retry the originally selected file.');
    }
    yield AttachmentUploadProgress(
      id: reservation.id,
      state: AttachmentUploadState.uploading,
      bytesTransferred: 0,
      totalBytes: file.sizeBytes,
    );
    try {
      _check();
      final result = await _owned(
        commands.call('uploadAttachment', attempt.command, {
          'attachmentId': reservation.id.value,
          'expectedRevision': reservation.revision,
          'contentBase64': base64Encode(file.bytes),
        }),
      );
      if (result.length != 2 ||
          result['attachmentId'] != reservation.id.value ||
          result['storageGeneration'] is! String) {
        throw DocumentReader.invalid();
      }
      AttachmentPolicy.validateGeneration(
        result['storageGeneration'] as String,
      );
      yield AttachmentUploadProgress(
        id: reservation.id,
        state: AttachmentUploadState.processing,
        bytesTransferred: file.sizeBytes,
        totalBytes: file.sizeBytes,
      );
    } catch (error) {
      yield* Stream.error(financialFailure(error));
    }
  }

  @override
  Future<AttachmentBytes> download(AttachmentId id) async {
    _check();
    try {
      final record = await _owned(
        documents
            .watchDocument('attachments', id.value)
            .first
            .timeout(const Duration(seconds: 15)),
      );
      if (record.document == null || record.document!.id != id.value) {
        throw DocumentReader.invalid();
      }
      final file = AttachmentDto.fromMap(
        id.value,
        record.document!.data,
        owner,
      );
      if (file.state != AttachmentState.ready || file.verification == null) {
        throw DocumentReader.invalid();
      }
      final bytes = await _owned(
        storage.download(file.storagePath, maxBytes: AttachmentPolicy.maxBytes),
      );
      if (bytes.length != file.verification!.sizeBytes ||
          crypto.sha256.convert(bytes).toString() !=
              file.verification!.sha256) {
        throw DocumentReader.invalid();
      }
      _check();
      return AttachmentBytes(
        owner: owner,
        id: id,
        filename: file.filename,
        contentType: file.verification!.contentType,
        bytes: bytes,
      );
    } catch (error) {
      throw financialFailure(error);
    }
  }

  @override
  Future<int> remove(
    CommandId command,
    AttachmentId id, {
    required int expectedRevision,
  }) async {
    _check();
    if (expectedRevision < 1 || expectedRevision >= 9007199254740991) {
      throw ArgumentError('Invalid file revision.');
    }
    try {
      final result = await _owned(
        commands.call('removeAttachment', command, {
          'attachmentId': id.value,
          'expectedRevision': expectedRevision,
        }),
      );
      if (result.length != 3 ||
          result['attachmentId'] != id.value ||
          result['state'] != 'deleted') {
        throw DocumentReader.invalid();
      }
      return DocumentReader(result).revision();
    } catch (error) {
      throw financialFailure(error);
    }
  }

  @override
  Future<void> dispose() async {
    if (_closed) return;
    _closed = true;
    _uploads.clear();
    for (final cancel in _cancelWork.toList()) {
      cancel();
    }
    _cancelWork.clear();
    try {
      await storage.dispose().timeout(const Duration(seconds: 1));
    } catch (_) {
      /* Local owner fence already applied. */
    }
  }
}
