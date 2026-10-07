import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/presentation/private_session_cleanup_provider.dart';
import '../../auth/presentation/auth_providers.dart';
import '../domain/attachment.dart';
import '../domain/attachment_preview_policy.dart';
import 'attachment_actions.dart';

class AttachmentPreview extends ConsumerStatefulWidget {
  const AttachmentPreview({super.key, required this.bytes});
  final AttachmentBytes bytes;
  @override
  ConsumerState<AttachmentPreview> createState() => _AttachmentPreviewState();
}

class _AttachmentPreviewState extends ConsumerState<AttachmentPreview> {
  AttachmentBytes? _bytes;
  ImageProvider? _image;
  Uint8List? _imageBytes;
  void Function()? _unregister;
  bool _saving = false;
  String? _error;
  @override
  void initState() {
    super.initState();
    _bytes = widget.bytes;
    if (AttachmentPreviewPolicy.canPreview(_bytes!.file)) {
      _imageBytes = Uint8List.fromList(_bytes!.file.bytes);
      _image = ResizeImage(
        MemoryImage(_imageBytes!),
        width: AttachmentPreviewPolicy.maxDecodedEdge,
        height: AttachmentPreviewPolicy.maxDecodedEdge,
        policy: ResizeImagePolicy.fit,
      );
    }
    _unregister = ref.read(privateSessionCleanupProvider).register(
      widget.bytes.owner,
      () async {
        _clear();
        if (mounted) setState(() {});
      },
    );
  }

  void _clear() {
    _bytes = null;
    final image = _image;
    _image = null;
    if (image != null) unawaited(image.evict());
    _imageBytes?.fillRange(0, _imageBytes!.length, 0);
    _imageBytes = null;
  }

  @override
  void dispose() {
    _unregister?.call();
    _clear();
    super.dispose();
  }

  Future<void> _save() async {
    final bytes = _bytes;
    if (bytes == null || _saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final saved = await ref
        .read(attachmentActionsProvider.notifier)
        .export(bytes);
    if (mounted) {
      setState(() {
        _saving = false;
        if (!saved) _error = 'Could not save this file. Try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bytes = _bytes;
    final owned = bytes != null && bytes.owner == ref.watch(ownerUidProvider);
    return ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * .72,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              owned ? bytes.file.filename : 'Private file closed',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            if (owned && _image != null)
              SizedBox(
                height: 240,
                child: Image(
                  image: _image!,
                  fit: BoxFit.contain,
                  errorBuilder: (_, _, _) => const Center(
                    child: Text(
                      'Image preview is unavailable. You can save the verified file.',
                    ),
                  ),
                ),
              ),
            if (owned && bytes.file.contentType == AttachmentContentType.pdf)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Column(
                  children: [
                    Icon(Icons.description_outlined, size: 48),
                    SizedBox(height: 12),
                    Text('PDF ready to save'),
                  ],
                ),
              ),
            if (owned &&
                _image == null &&
                bytes.file.contentType != AttachmentContentType.pdf)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Text(
                  'Image preview is unavailable. You can save or share the original file.',
                ),
              ),
            if (owned)
              const Text('Private file · save or share only when you choose.'),
            if (_error != null)
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              runSpacing: 8,
              children: [
                if (owned)
                  FilledButton.icon(
                    onPressed: _saving ? null : _save,
                    icon: const Icon(Icons.save_alt),
                    label: Text(_saving ? 'Saving…' : 'Save or share'),
                  ),
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Close'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
