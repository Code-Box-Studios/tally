import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../attachments/domain/attachment.dart';
import '../../attachments/presentation/attachment_providers.dart';
import '../domain/pending_evidence.dart';
import 'pending_evidence_providers.dart';

Future<AttachmentFileInput?> _pickOwnedReceipt(WidgetRef ref) async {
  final subscription = ref.listenManual(attachmentPickerProvider, (_, _) {});
  try {
    return await subscription.read().select();
  } finally {
    subscription.close();
  }
}

class PendingReceiptPicker extends ConsumerStatefulWidget {
  const PendingReceiptPicker({super.key, required this.onChanged});
  final ValueChanged<AttachmentFileInput?> onChanged;
  @override
  ConsumerState<PendingReceiptPicker> createState() =>
      _PendingReceiptPickerState();
}

class _PendingReceiptPickerState extends ConsumerState<PendingReceiptPicker> {
  AttachmentFileInput? _file;
  bool _busy = false;
  String? _error;
  Future<void> _pick() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final file = await _pickOwnedReceipt(ref);
      if (!mounted || file == null) return;
      setState(() => _file = file);
      widget.onChanged(file);
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = 'Could not choose this receipt. You can record the payment and add a receipt later.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      TextButton.icon(
        onPressed: _busy ? null : _pick,
        icon: const Icon(Icons.attach_file),
        label: Text(
          _busy
              ? 'Choosing receipt…'
              : _file == null
              ? 'Add receipt (optional)'
              : 'Change selected receipt',
        ),
      ),
      if (_file != null) ...[
        Text(_file!.filename),
        Text(
          kIsWeb
              ? 'Keep the original file. This browser needs it again after reopening until the receipt is published.'
              : 'After the payment is saved, Tally will try to keep a private receipt copy on this device.',
        ),
        TextButton(
          onPressed: _busy
              ? null
              : () {
                  setState(() => _file = null);
                  widget.onChanged(null);
                },
          child: const Text('Remove selected receipt'),
        ),
      ],
      if (_error != null) Text(_error!),
    ],
  );
}

class PendingReceiptPanel extends ConsumerStatefulWidget {
  const PendingReceiptPanel({super.key, required this.commandId});
  final CommandId commandId;
  @override
  ConsumerState<PendingReceiptPanel> createState() =>
      _PendingReceiptPanelState();
}

class _PendingReceiptPanelState extends ConsumerState<PendingReceiptPanel> {
  bool _busy = false;
  String? _error;
  Future<void> _run(Future<void> Function() work) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await work();
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error is PendingEvidenceFailure ? error.message : 'Receipt could not sync. Your payment is still saved. Retry after reconnecting.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _choose() => _run(() async {
    final file = await _pickOwnedReceipt(ref);
    if (file == null || !mounted) return;
    final coordinator = await ref.read(
      pendingEvidenceCoordinatorProvider.future,
    );
    await coordinator.stage(widget.commandId, file);
    await coordinator.reconcile(retry: widget.commandId);
    if (mounted) {
      ref.invalidate(receiptBytesAvailableProvider(widget.commandId));
    }
  });
  @override
  Widget build(BuildContext context) {
    final rows = ref.watch(pendingEvidenceProvider);
    final value = rows.asData?.value
        .where((value) => value.commandId == widget.commandId)
        .firstOrNull;
    final available = value == null
        ? true
        : ref
              .watch(receiptBytesAvailableProvider(widget.commandId))
              .asData
              ?.value;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Receipt'),
            const SizedBox(height: 8),
            if (value != null) ...[
              Text(value.filename),
              Text(switch (value.phase) {
                PendingEvidencePhase.waitingForPayment => 'Payment is waiting or needs review. The receipt uploads only after that payment is confirmed.',
                PendingEvidencePhase.readyToUpload =>
                  'Payment is saved. Receipt is waiting to upload.',
                PendingEvidencePhase.processing => 'Payment is saved. Receipt is being checked before publication.',
                PendingEvidencePhase.needsReview => 'Payment is saved. Receipt needs review or another upload attempt.',
              }),
              if (available == false)
                const Text(
                  'Choose the original receipt again. Its details are saved, but the file is unavailable on this device.',
                ),
              if (available != false)
                TextButton(
                  onPressed: _busy
                      ? null
                      : () => _run(
                          () async => (await ref.read(
                            pendingEvidenceCoordinatorProvider.future,
                          )).reconcile(retry: widget.commandId),
                        ),
                  child: const Text('Retry receipt upload'),
                ),
              TextButton(
                onPressed: _busy
                    ? null
                    : () => _run(
                        () async => (await ref.read(
                          pendingEvidenceCoordinatorProvider.future,
                        )).cancel(widget.commandId),
                      ),
                child: const Text('Remove saved receipt copy'),
              ),
              const Text(
                'Removing this copy does not change your payment or remove an already published receipt.',
              ),
            ],
            TextButton.icon(
              onPressed: _busy ? null : _choose,
              icon: const Icon(Icons.attach_file),
              label: Text(
                _busy
                    ? 'Working…'
                    : value == null
                    ? 'Choose receipt'
                    : 'Choose original receipt again',
              ),
            ),
            if (rows.hasError)
              const Text(
                'Receipt storage is unavailable. Your payment remains saved.',
              ),
            if (_error != null) Text(_error!),
          ],
        ),
      ),
    );
  }
}

class PendingReceipts extends ConsumerWidget {
  const PendingReceipts({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rows =
        ref.watch(pendingEvidenceProvider).asData?.value ??
        const <PendingEvidence>[];
    if (rows.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Receipts waiting to publish'),
        for (final value in rows)
          PendingReceiptPanel(
            key: ValueKey(value.commandId),
            commandId: value.commandId,
          ),
      ],
    );
  }
}
