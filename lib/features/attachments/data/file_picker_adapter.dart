import 'dart:async';
import 'dart:typed_data';

import 'package:file_selector/file_selector.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/financial_failure.dart';
import '../domain/attachment.dart';
import '../domain/attachment_policy.dart';
import '../domain/attachment_capabilities.dart';
import 'file_picker_cleanup.dart';

final class AttachmentFilePicker implements AttachmentPicker {
  AttachmentFilePicker({
    required this.owner,
    required this.currentOwner,
    Future<XFile?> Function()? choose,
  }) : _choose = choose ?? _open;
  final OwnerUid owner;
  final OwnerUid? Function() currentOwner;
  final Future<XFile?> Function() _choose;
  bool _closed = false;
  final _cancelWork = <void Function()>{};
  static Future<XFile?> _open() => openFile(
    acceptedTypeGroups: const [
      XTypeGroup(
        label: 'Images and PDF',
        extensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
        uniformTypeIdentifiers: [
          'public.jpeg',
          'public.png',
          'org.webmproject.webp',
          'com.adobe.pdf',
        ],
      ),
    ],
  );
  void _check() {
    if (_closed || currentOwner() != owner) {
      throw const FinancialFailure(
        FinancialFailureCode.signIn,
        'Your sign-in changed.',
      );
    }
  }

  Future<T> _owned<T>(Future<T> work) async {
    final cancelled = Completer<T>();
    void cancel() => cancelled.completeError(
      const FinancialFailure(
        FinancialFailureCode.signIn,
        'Your sign-in changed.',
      ),
    );
    _cancelWork.add(cancel);
    try {
      return await Future.any<T>([work, cancelled.future]);
    } finally {
      _cancelWork.remove(cancel);
    }
  }

  @override
  Future<AttachmentFileInput?> select() async {
    _check();
    final file = await _owned(
      _choose().then((file) {
        if (_closed || currentOwner() != owner) {
          if (file != null) releasePickedFile(file);
          _check();
        }
        return file;
      }),
    );
    if (file == null) {
      _check();
      return null;
    }
    try {
      _check();
      AttachmentPolicy.validateFilename(file.name);
      final size = await _owned(file.length());
      _check();
      AttachmentPolicy.validateSize(size);
      final mime = file.mimeType;
      final type =
          mime != null && mime.isNotEmpty && mime != 'application/octet-stream'
          ? AttachmentContentType.parse(mime)
          : switch (file.name.split('.').last.toLowerCase()) {
              'jpg' || 'jpeg' => AttachmentContentType.jpeg,
              'png' => AttachmentContentType.png,
              'webp' => AttachmentContentType.webp,
              'pdf' => AttachmentContentType.pdf,
              _ => throw ArgumentError('Choose a JPEG, PNG, WebP or PDF file.'),
            };
      final bytes = await _owned(
        _read(file, size).timeout(const Duration(seconds: 30)),
      );
      _check();
      return AttachmentFileInput(
        filename: file.name,
        contentType: type,
        bytes: bytes,
      );
    } finally {
      releasePickedFile(file);
    }
  }

  Future<Uint8List> _read(XFile file, int expected) async {
    final builder = BytesBuilder(copy: false);
    await for (final chunk in file.openRead()) {
      _check();
      if (builder.length + chunk.length > AttachmentPolicy.maxBytes) {
        throw ArgumentError('Choose a file up to10 MiB.');
      }
      builder.add(chunk);
    }
    _check();
    if (builder.length != expected || await file.length() != expected) {
      throw ArgumentError('The selected file changed. Select it again.');
    }
    return builder.takeBytes();
  }

  @override
  Future<void> dispose() async {
    _closed = true;
    for (final cancel in _cancelWork.toList()) {
      cancel();
    }
    _cancelWork.clear();
  }
}
