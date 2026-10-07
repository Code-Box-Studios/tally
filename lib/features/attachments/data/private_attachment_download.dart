import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import '../../../core/identifiers/command_id_factory.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/data/owner_command_gateway.dart';
import '../../../shared/domain/financial_failure.dart';
import '../domain/attachment_policy.dart';

/// Reads private bytes without invoking a token-producing Storage media API.
final class PrivateAttachmentDownload {
  PrivateAttachmentDownload(this.commands, {required this.checkOwner});
  final OwnerCommandGateway commands;
  final void Function() checkOwner;
  final _active = <Completer<void>>{};
  bool _closed = false;
  static const _unavailable = FinancialFailure(
    FinancialFailureCode.unavailable,
    'Could not open this private file. Reconnect and try again.',
  );
  void _check() {
    if (_closed) throw _unavailable;
    checkOwner();
  }

  Future<Uint8List> download(AttachmentId id, {required int maxBytes}) async {
    if (maxBytes < 1 || maxBytes > AttachmentPolicy.maxBytes) {
      throw ArgumentError('A bounded file read is required.');
    }
    _check();
    final cancel = Completer<void>();
    _active.add(cancel);
    final timer = Timer(const Duration(seconds: 30), () {
      if (!cancel.isCompleted) cancel.complete();
    });
    Future<Uint8List> read() async {
      final result = await commands.call('downloadAttachment', newCommandId(), {
        'attachmentId': id.value,
      });
      _check();
      if (cancel.isCompleted ||
          result.length != 3 ||
          result['attachmentId'] != id.value ||
          result['storageGeneration'] is! String ||
          result['contentBase64'] is! String) {
        throw _unavailable;
      }
      AttachmentPolicy.validateGeneration(
        result['storageGeneration'] as String,
      );
      final encoded = result['contentBase64'] as String;
      if (encoded.isEmpty ||
          encoded.length > 4 * ((maxBytes + 2) ~/ 3) ||
          encoded.length % 4 != 0 ||
          !RegExp(r'^[A-Za-z0-9+/]+={0,2}$').hasMatch(encoded)) {
        throw _unavailable;
      }
      final bytes = base64Decode(encoded);
      if (bytes.isEmpty ||
          bytes.length > maxBytes ||
          base64Encode(bytes) != encoded) {
        throw _unavailable;
      }
      _check();
      return bytes;
    }

    try {
      return await Future.any([
        read(),
        cancel.future.then<Uint8List>((_) => throw _unavailable),
      ]);
    } finally {
      if (!cancel.isCompleted) cancel.complete();
      timer.cancel();
      _active.remove(cancel);
    }
  }

  Future<void> dispose() async {
    _closed = true;
    for (final cancel in _active.toList()) {
      if (!cancel.isCompleted) cancel.complete();
    }
  }
}
