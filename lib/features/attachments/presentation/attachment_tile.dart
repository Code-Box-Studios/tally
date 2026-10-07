import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/presentation/financial_form_support.dart';
import '../domain/attachment.dart';
import 'attachment_actions.dart';
import 'attachment_preview.dart';

String attachmentStateLabel(AttachmentState state) => switch (state) {
  AttachmentState.awaitingUpload => 'Waiting for upload',
  AttachmentState.processing => 'Checking file',
  AttachmentState.ready => 'Ready',
  AttachmentState.rejected => 'File could not be added',
  AttachmentState.deleted => 'Attachment removed',
};
String attachmentRejectionMessage(
  AttachmentRejection? reason,
) => switch (reason) {
  AttachmentRejection.unsupportedFormat =>
    'Choose a supported JPEG, PNG, WebP or PDF file.',
  AttachmentRejection.sizeMismatch =>
    'The file changed size. Remove this entry and select the file again.',
  AttachmentRejection.checksumMismatch =>
    'The file changed during upload. Remove this entry and select it again.',
  AttachmentRejection.uploadExpired =>
    'The upload expired. Remove this entry and add the file again.',
  _ => 'The file could not be verified. Remove this entry and try adding it again.',
};

class AttachmentTile extends ConsumerStatefulWidget {
  const AttachmentTile({super.key, required this.file});
  final Attachment file;
  @override
  ConsumerState<AttachmentTile> createState() => _AttachmentTileState();
}

class _AttachmentTileState extends ConsumerState<AttachmentTile> {
  bool _busy = false;
  String? _error;
  Future<void> _preview() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final bytes = await ref
        .read(attachmentActionsProvider.notifier)
        .preview(widget.file.id);
    if (!mounted) return;
    setState(() => _busy = false);
    if (bytes == null) {
      setState(
        () => _error =
            'Could not open this private file. Reconnect and try again.',
      );
      return;
    }
    await showFinancialDialog<void>(
      context,
      AttachmentPreview(bytes: bytes),
      guardSubmission: false,
    );
  }

  Future<void> _remove() async {
    final confirmed = await showDialog<bool>(
      context: context,
      useRootNavigator: false,
      builder: (context) => AlertDialog(
        title: const Text('Remove file?'),
        content: const Text(
          'The file will become unavailable. Its history remains traceable.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep file'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Remove file'),
          ),
        ],
      ),
    );
    if (!mounted || confirmed != true) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final removed = await ref
        .read(attachmentActionsProvider.notifier)
        .remove(widget.file);
    if (mounted) {
      setState(() {
        _busy = false;
        if (!removed) {
          _error =
              'Could not confirm removal. Refresh this section and try again.';
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final file = widget.file;
    final action = ref.watch(attachmentActionsProvider);
    final busy = _busy || action.isBusy;
    final waitingForCheck =
        file.state == AttachmentState.awaitingUpload &&
        action.id == file.id &&
        action.phase == AttachmentActionPhase.processing;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                file.state == AttachmentState.deleted
                    ? Icons.history
                    : file.declaredContentType == AttachmentContentType.pdf
                    ? Icons.description_outlined
                    : Icons.image_outlined,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  file.filename,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            waitingForCheck
                ? 'Checking file'
                : attachmentStateLabel(file.state),
          ),
          if (file.state == AttachmentState.rejected)
            Text(attachmentRejectionMessage(file.rejectionReason)),
          if (file.state != AttachmentState.deleted)
            Text(
              '${file.declaredContentType.mime == 'application/pdf' ? 'PDF' : file.declaredContentType.name.toUpperCase()} · ${(file.declaredSizeBytes / 1024).ceil()} KB',
            ),
          if (_busy)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: LinearProgressIndicator(),
            ),
          if (_error != null)
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (file.state == AttachmentState.ready)
                TextButton.icon(
                  key: Key('preview-${file.id.value}'),
                  onPressed: busy ? null : _preview,
                  icon: const Icon(Icons.visibility_outlined),
                  label: const Text('Open file'),
                ),
              if (file.state != AttachmentState.deleted)
                TextButton.icon(
                  key: Key('remove-${file.id.value}'),
                  onPressed: busy ? null : _remove,
                  icon: const Icon(Icons.delete_outline),
                  label: const Text('Remove'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
