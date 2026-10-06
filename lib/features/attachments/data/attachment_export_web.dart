import 'dart:async';
import 'dart:js_interop';
import 'dart:typed_data';

import 'package:web/web.dart' as web;

import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/financial_failure.dart';
import '../domain/attachment.dart';
import '../domain/attachment_capabilities.dart';

AttachmentExporter createAttachmentExporter(
  OwnerUid owner,
  OwnerUid? Function() currentOwner,
) => WebAttachmentExporter(owner: owner, currentOwner: currentOwner);

final class WebAttachmentExporter implements AttachmentExporter {
  WebAttachmentExporter({required this.owner, required this.currentOwner});
  final OwnerUid owner;
  final OwnerUid? Function() currentOwner;
  final _urls = <String>{};
  bool _closed = false;
  void _check() {
    if (_closed || currentOwner() != owner) {
      throw const FinancialFailure(
        FinancialFailureCode.signIn,
        'Your sign-in changed.',
      );
    }
  }

  @override
  Future<void> export(AttachmentBytes bytes) async {
    _check();
    if (bytes.owner != owner) {
      throw ArgumentError('This file belongs to another owner.');
    }
    final copied = Uint8List.fromList(bytes.file.bytes);
    final blob = web.Blob(
      [copied.toJS].toJS,
      web.BlobPropertyBag(type: bytes.file.contentType.mime),
    );
    copied.fillRange(0, copied.length, 0);
    final url = web.URL.createObjectURL(blob);
    _urls.add(url);
    final anchor = (web.document.createElement('a') as web.HTMLAnchorElement)
      ..href = url
      ..download = bytes.file.filename;
    try {
      _check();
      web.document.body?.append(anchor);
      anchor.click();
      anchor.remove();
      // Give the browser time to consume its local download URL.
      await Future<void>.delayed(const Duration(seconds: 1));
      _check();
    } finally {
      anchor.remove();
      _revoke(url);
    }
  }

  void _revoke(String url) {
    if (_urls.remove(url)) web.URL.revokeObjectURL(url);
  }

  @override
  Future<void> dispose() async {
    _closed = true;
    for (final url in _urls.toList()) {
      _revoke(url);
    }
  }
}
