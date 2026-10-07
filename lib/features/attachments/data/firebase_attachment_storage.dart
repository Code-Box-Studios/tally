import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/data/owner_command_gateway.dart';
import '../../../shared/domain/financial_failure.dart';
import '../domain/attachment_policy.dart';
import 'private_attachment_download.dart';

abstract interface class AttachmentStorageGateway {
  OwnerUid get owner;
  Future<Uint8List> download(String path, {required int maxBytes});
  Future<void> dispose();
}

final class FirebaseAttachmentStorage implements AttachmentStorageGateway {
  FirebaseAttachmentStorage(this.commands, this.auth, this.owner) {
    if (commands.owner != owner) {
      throw ArgumentError('File transport owners must match.');
    }
    _download = PrivateAttachmentDownload(commands, checkOwner: _checkOwner);
  }
  final OwnerCommandGateway commands;
  final FirebaseAuth auth;
  @override
  final OwnerUid owner;
  bool _closed = false;
  late final PrivateAttachmentDownload _download;
  void _checkOwner() {
    if (_closed || auth.currentUser?.uid != owner.value) {
      throw const FinancialFailure(
        FinancialFailureCode.signIn,
        'Your sign-in changed.',
      );
    }
  }

  @override
  Future<Uint8List> download(String path, {required int maxBytes}) async {
    _checkOwner();
    final match = RegExp(
      r'^users/([A-Za-z0-9_-]{1,128})/attachments/([A-Za-z0-9_-]{1,128})/content$',
    ).firstMatch(path);
    if (match == null ||
        match[1] != owner.value ||
        maxBytes != AttachmentPolicy.maxBytes) {
      throw ArgumentError('Choose an owned, bounded file.');
    }
    final bytes = await _download.download(
      AttachmentId(match[2]!),
      maxBytes: maxBytes,
    );
    _checkOwner();
    AttachmentPolicy.validateSize(bytes.length);
    return bytes;
  }

  @override
  Future<void> dispose() async {
    _closed = true;
    await _download.dispose();
  }
}
