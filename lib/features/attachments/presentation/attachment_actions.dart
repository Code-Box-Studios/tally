import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show KeepAliveLink;

import '../../../core/identifiers/command_id_factory.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/data/financial_failure_mapper.dart';
import '../../../shared/domain/financial_failure.dart';
import '../domain/attachment.dart';
import 'attachment_providers.dart';

enum AttachmentActionPhase {
  idle,
  selecting,
  reserving,
  uploading,
  processing,
  failed,
}

final class AttachmentActionState {
  const AttachmentActionState({
    this.phase = AttachmentActionPhase.idle,
    this.filename,
    this.id,
    this.failure,
    this.canRetry = false,
  });
  final AttachmentActionPhase phase;
  final String? filename;
  final AttachmentId? id;
  final FinancialFailure? failure;
  final bool canRetry;
  bool get isBusy => {
    AttachmentActionPhase.selecting,
    AttachmentActionPhase.reserving,
    AttachmentActionPhase.uploading,
  }.contains(phase);
}

final class _PendingFile {
  _PendingFile(this.target, this.file, this.command);
  final AttachmentTarget target;
  final AttachmentFileInput file;
  final CommandId command;
  AttachmentReservation? reservation;
}

final attachmentActionsProvider =
    NotifierProvider.autoDispose<AttachmentActions, AttachmentActionState>(
      AttachmentActions.new,
      dependencies: [
        attachmentsRepositoryProvider,
        attachmentPickerProvider,
        attachmentExporterProvider,
      ],
    );

class AttachmentActions extends Notifier<AttachmentActionState> {
  _PendingFile? _pending;
  KeepAliveLink? _retryLease;
  final _removals = <String, CommandId>{};
  @override
  AttachmentActionState build() {
    ref.watch(attachmentsRepositoryProvider);
    ref.watch(attachmentPickerProvider);
    ref.watch(attachmentExporterProvider);
    ref.onDispose(() {
      _pending = null;
      _removals.clear();
    });
    return const AttachmentActionState();
  }

  Future<void> select(AttachmentTarget target) async {
    if (state.isBusy || _pending != null) return;
    state = const AttachmentActionState(phase: AttachmentActionPhase.selecting);
    try {
      final file = await ref.read(attachmentPickerProvider).select();
      if (!ref.mounted) return;
      if (file == null) {
        state = const AttachmentActionState();
        return;
      }
      _retryLease ??= ref.keepAlive();
      _pending = _PendingFile(target, file, newCommandId());
      await _submit();
    } catch (error) {
      if (ref.mounted) {
        state = AttachmentActionState(
          phase: AttachmentActionPhase.failed,
          failure: financialFailure(error),
        );
      }
    }
  }

  Future<void> retry() async {
    if (!state.isBusy && _pending != null) await _submit();
  }

  Future<void> _submit() async {
    final pending = _pending;
    if (pending == null || !ref.mounted) return;
    final repo = ref.read(attachmentsRepositoryProvider);
    try {
      if (pending.reservation == null) {
        state = AttachmentActionState(
          phase: AttachmentActionPhase.reserving,
          filename: pending.file.filename,
        );
        pending.reservation = await repo.reserve(
          pending.command,
          AttachmentReservationInput(
            target: pending.target,
            filename: pending.file.filename,
            contentType: pending.file.contentType,
            sizeBytes: pending.file.sizeBytes,
            sha256: pending.file.sha256,
          ),
        );
        if (!ref.mounted) return;
      }
      state = AttachmentActionState(
        phase: AttachmentActionPhase.uploading,
        filename: pending.file.filename,
        id: pending.reservation!.id,
      );
      await for (final progress in repo.upload(
        pending.reservation!,
        pending.file,
      )) {
        if (!ref.mounted) return;
        state = AttachmentActionState(
          phase: progress.state == AttachmentUploadState.processing
              ? AttachmentActionPhase.processing
              : AttachmentActionPhase.uploading,
          filename: pending.file.filename,
          id: progress.id,
        );
      }
      if (ref.mounted) {
        _pending = null;
        _retryLease?.close();
        _retryLease = null;
      }
    } catch (error) {
      if (ref.mounted) {
        state = AttachmentActionState(
          phase: AttachmentActionPhase.failed,
          filename: pending.file.filename,
          id: pending.reservation?.id,
          failure: financialFailure(error),
          canRetry: true,
        );
      }
    }
  }

  Future<bool> remove(Attachment file) async {
    final repo = ref.read(attachmentsRepositoryProvider);
    if (file.owner != repo.owner || state.isBusy) return false;
    final key = '${file.id.value}:${file.revision}',
        command = _removals.putIfAbsent(key, newCommandId);
    try {
      await repo.remove(command, file.id, expectedRevision: file.revision);
      if (!ref.mounted) return false;
      _removals.remove(key);
      return true;
    } catch (error) {
      if (ref.mounted) {
        state = AttachmentActionState(
          phase: AttachmentActionPhase.failed,
          failure: financialFailure(error),
          canRetry: _pending != null,
        );
      }
      return false;
    }
  }

  Future<AttachmentBytes?> preview(AttachmentId id) async {
    try {
      final bytes = await ref.read(attachmentsRepositoryProvider).download(id);
      return ref.mounted ? bytes : null;
    } catch (error) {
      if (ref.mounted) {
        state = AttachmentActionState(
          phase: AttachmentActionPhase.failed,
          failure: financialFailure(error),
          canRetry: _pending != null,
        );
      }
      return null;
    }
  }

  Future<bool> export(AttachmentBytes bytes) async {
    if (bytes.owner != ref.read(attachmentsRepositoryProvider).owner) {
      return false;
    }
    try {
      await ref.read(attachmentExporterProvider).export(bytes);
      return ref.mounted;
    } catch (error) {
      if (ref.mounted) {
        state = AttachmentActionState(
          phase: AttachmentActionPhase.failed,
          failure: financialFailure(error),
          canRetry: _pending != null,
        );
      }
      return false;
    }
  }
}
