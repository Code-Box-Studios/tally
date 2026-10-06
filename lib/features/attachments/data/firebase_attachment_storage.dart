import 'dart:typed_data';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/financial_failure.dart';
import '../domain/attachment_policy.dart';

abstract interface class AttachmentStorageGateway {
  OwnerUid get owner;
  Future<Uint8List> download(String path, {required int maxBytes});
  Future<void> dispose();
}

final class FirebaseAttachmentStorage implements AttachmentStorageGateway {
  FirebaseAttachmentStorage(this.storage, this.auth, this.owner);
  final FirebaseStorage storage;
  final FirebaseAuth auth;
  @override
  final OwnerUid owner;
  bool _closed = false;
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
    final bytes = await storage
        .ref(path)
        .getData(maxBytes)
        .timeout(const Duration(seconds: 30));
    _checkOwner();
    if (bytes == null) throw StateError('File unavailable.');
    AttachmentPolicy.validateSize(bytes.length);
    return bytes;
  }

  @override
  Future<void> dispose() async {
    _closed = true;
  }
}
