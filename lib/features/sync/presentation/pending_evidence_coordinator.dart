import 'dart:async';

import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/data_page.dart';
import '../../../shared/domain/financial_failure.dart';
import '../../attachments/domain/attachment.dart';
import '../../attachments/domain/attachments_repository.dart';
import '../domain/pending_evidence.dart';
import '../domain/pending_evidence_store.dart';

/// Uploads private evidence only after its independent payment is confirmed.
final class PendingEvidenceCoordinator {
  PendingEvidenceCoordinator({
    required this.store,
    required this.attachments,
    required this.resolvePayment,
    required this.isOwnerActive,
  }) {
    if (store.owner != attachments.owner) {
      throw ArgumentError('Receipt owners must match.');
    }
  }
  final PendingEvidenceStore store;
  final AttachmentsRepository attachments;
  final Future<PaymentId?> Function(CommandId) resolvePayment;
  final bool Function() isOwnerActive;
  final _published =
      <
        CommandId,
        ({
          String fileKey,
          AttachmentId reservationId,
          StreamSubscription<DataPage<Attachment>> subscription,
        })
      >{};
  final _cancel = <void Function()>{};
  Future<void>? _running;
  bool _disposed = false;
  bool get _active => !_disposed && isOwnerActive();
  void _check() {
    if (!_active) {
      throw const PendingEvidenceFailure(PendingEvidenceFailureCode.ownership);
    }
  }

  Future<T> _owned<T>(Future<T> work) async {
    _check();
    final cancelled = Completer<T>();
    void cancel() => cancelled.completeError(
      const PendingEvidenceFailure(PendingEvidenceFailureCode.ownership),
    );
    _cancel.add(cancel);
    try {
      final value = await Future.any([
        work.timeout(const Duration(seconds: 20)),
        cancelled.future,
      ]);
      _check();
      return value;
    } finally {
      _cancel.remove(cancel);
    }
  }

  Future<PendingEvidence> stage(
    CommandId id,
    AttachmentFileInput file, {
    PaymentId? paymentId,
  }) async {
    _check();
    var value = await _owned(store.persist(id, file));
    if (paymentId != null) {
      value = value.progress(
        phase: PendingEvidencePhase.readyToUpload,
        paymentId: paymentId,
      );
      await _owned(store.update(value));
    }
    return value;
  }

  Future<void> reconcile({CommandId? retry}) {
    if (!_active) return Future.value();
    return _running ??= _reconcile(retry).whenComplete(() {
      _running = null;
    });
  }

  Future<void> _reconcile(CommandId? retry) async {
    try {
      for (var value in await _owned(store.list())) {
        _check();
        if (value.phase == PendingEvidencePhase.needsReview &&
            value.commandId != retry) {
          continue;
        }
        try {
          final payment =
              value.paymentId ?? await _owned(resolvePayment(value.commandId));
          if (payment == null) continue;
          if (value.paymentId == null) {
            value = value.progress(
              phase: PendingEvidencePhase.readyToUpload,
              paymentId: payment,
            );
            await _owned(store.update(value));
          }
          final target = AttachmentTarget.forPayment(payment);
          if (value.reservation != null) {
            final page = await _owned(attachments.getTarget(target));
            if (await _publishedState(value, page)) continue;
          }
          final file = await _owned(store.readFile(value.commandId));
          if (value.reservation == null) {
            final reserved = await _owned(
              attachments.reserve(
                value.reserveCommandId,
                AttachmentReservationInput(
                  target: target,
                  filename: value.filename,
                  contentType: value.contentType,
                  sizeBytes: value.sizeBytes,
                  sha256: value.sha256,
                ),
              ),
            );
            if (reserved.owner != store.owner) {
              throw const PendingEvidenceFailure(
                PendingEvidenceFailureCode.ownership,
              );
            }
            value = value.progress(
              phase: PendingEvidencePhase.readyToUpload,
              reservation: reserved,
            );
            await _owned(store.update(value));
          }
          await _owned(
            attachments
                .upload(
                  value.reservation!,
                  file,
                  commandId: value.uploadCommandId,
                )
                .drain<void>(),
          );
          value = value.progress(phase: PendingEvidencePhase.processing);
          await _owned(store.update(value));
          _watch(value);
        } catch (error) {
          if (!_active) return;
          if (value.paymentId != null) {
            await _recordFailure(value, error);
          }
        }
      }
    } catch (_) {
      /* Background evidence recovery cannot undo a saved payment. */
    }
  }

  Future<void> _recordFailure(PendingEvidence value, Object error) async {
    if (!_active) return;
    final code = switch (error) {
      PendingEvidenceFailure(:final code) => code.name,
      FinancialFailure(:final code) => code.name,
      _ => 'unavailable',
    };
    try {
      await store.update(
        value.progress(
          phase: PendingEvidencePhase.needsReview,
          failureCode: code,
        ),
      );
    } catch (_) {
      /* Preserve the original metadata if local writes fail. */
    }
  }

  Future<bool> _publishedState(
    PendingEvidence value,
    DataPage<Attachment> page,
  ) async {
    _check();
    final matches = page.items
        .where((file) => file.id == value.reservation!.id)
        .toList();
    if (matches.isEmpty) return false;
    final file = matches.single;
    if (file.owner != store.owner ||
        file.target != AttachmentTarget.forPayment(value.paymentId!) ||
        file.filename != value.filename ||
        file.declaredSha256 != value.sha256 ||
        file.declaredSizeBytes != value.sizeBytes ||
        file.declaredContentType != value.contentType) {
      throw const PendingEvidenceFailure(
        PendingEvidenceFailureCode.changedFile,
      );
    }
    if (page.isFromCache &&
        {
          AttachmentState.ready,
          AttachmentState.rejected,
          AttachmentState.deleted,
        }.contains(file.state)) {
      _watch(value);
      return true;
    }
    if (file.state == AttachmentState.ready) {
      await _owned(store.remove(value.commandId, expected: value));
      await _stopWatching(value);
      return true;
    }
    if (file.state == AttachmentState.rejected ||
        file.state == AttachmentState.deleted) {
      await _recordFailure(
        value,
        const FinancialFailure(
          FinancialFailureCode.recovery,
          'Receipt needs review.',
        ),
      );
      await _stopWatching(value);
      return true;
    }
    if (value.phase == PendingEvidencePhase.processing) {
      _watch(value);
      return true;
    }
    return false;
  }

  Future<void> _stopWatching(PendingEvidence value) async {
    final current = _published[value.commandId];
    if (current == null ||
        current.fileKey != value.fileKey ||
        current.reservationId != value.reservation?.id) {
      return;
    }
    _published.remove(value.commandId);
    await current.subscription.cancel();
  }

  void _watch(PendingEvidence value) {
    if (!_active) return;
    final current = _published[value.commandId];
    if (current != null) {
      if (current.fileKey == value.fileKey &&
          current.reservationId == value.reservation!.id) {
        return;
      }
      _published.remove(value.commandId);
      unawaited(current.subscription.cancel());
    }
    final subscription = attachments
        .watchTarget(AttachmentTarget.forPayment(value.paymentId!))
        .listen(
          (page) {
            if (_active) {
              unawaited(
                _publishedState(value, page).catchError((Object error) async {
                  await _recordFailure(value, error);
                  return true;
                }),
              );
            }
          },
          onError: (Object error) {
            if (_active) unawaited(_recordFailure(value, error));
          },
        );
    _published[value.commandId] = (
      fileKey: value.fileKey,
      reservationId: value.reservation!.id,
      subscription: subscription,
    );
  }

  Future<void> cancel(CommandId id) async {
    _check();
    if (_running != null) {
      throw const PendingEvidenceFailure(
        PendingEvidenceFailureCode.unavailable,
      );
    }
    final value = await _owned(store.get(id));
    if (value == null) return;
    await _stopWatching(value);
    await _owned(store.remove(id, expected: value));
  }

  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    for (final cancel in _cancel.toList()) {
      cancel();
    }
    for (final observer in _published.values.toList()) {
      await observer.subscription.cancel();
    }
    _published.clear();
  }
}
