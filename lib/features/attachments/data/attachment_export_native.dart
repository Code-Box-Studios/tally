import 'dart:async';
import 'dart:io';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/widgets.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/identifiers/command_id_factory.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/financial_failure.dart';
import '../domain/attachment.dart';
import '../domain/attachment_capabilities.dart';

AttachmentExporter createAttachmentExporter(
  OwnerUid owner,
  OwnerUid? Function() currentOwner,
) => NativeAttachmentExporter(owner: owner, currentOwner: currentOwner);

final class NativeAttachmentExporter implements AttachmentExporter {
  NativeAttachmentExporter({
    required this.owner,
    required this.currentOwner,
    Future<Directory> Function()? temporaryDirectory,
    Rect Function()? origin,
    this._share,
  }) : _temporaryDirectory = temporaryDirectory ?? getTemporaryDirectory,
       _origin = origin ?? _windowOrigin;
  final OwnerUid owner;
  final OwnerUid? Function() currentOwner;
  final Future<Directory> Function() _temporaryDirectory;
  final Rect Function() _origin;
  final Future<void> Function(String, String, Rect)? _share;
  final _closed = Completer<void>();
  final _directories = <Directory>{};
  static Rect _windowOrigin() {
    final view = WidgetsBinding.instance.platformDispatcher.views.first;
    final size = view.physicalSize / view.devicePixelRatio;
    return Rect.fromCenter(
      center: Offset(size.width / 2, size.height / 2),
      width: 1,
      height: 1,
    );
  }

  void _check() {
    if (_closed.isCompleted || currentOwner() != owner) {
      throw const FinancialFailure(
        FinancialFailureCode.signIn,
        'Your sign-in changed.',
      );
    }
  }

  Future<T> _owned<T>(Future<T> work) => Future.any([
    work,
    _closed.future.then<T>(
      (_) => throw const FinancialFailure(
        FinancialFailureCode.signIn,
        'Your sign-in changed.',
      ),
    ),
  ]);
  @override
  Future<void> export(AttachmentBytes bytes) async {
    _check();
    if (bytes.owner != owner) {
      throw ArgumentError('This file belongs to another owner.');
    }
    Directory? directory;
    try {
      final temp = await _owned(_temporaryDirectory());
      _check();
      directory = Directory(
        '${temp.path}${Platform.pathSeparator}tally_exports${Platform.pathSeparator}${owner.value}${Platform.pathSeparator}${newCommandId().value}',
      );
      _directories.add(directory);
      await directory.create(recursive: true);
      _check();
      final file = File(
        '${directory.path}${Platform.pathSeparator}${bytes.id.value}.${bytes.file.contentType.extension}',
      );
      await file.writeAsBytes(bytes.file.bytes, flush: true);
      _check();
      final origin = _origin();
      if (origin.isEmpty ||
          !origin.left.isFinite ||
          !origin.top.isFinite ||
          !origin.width.isFinite ||
          !origin.height.isFinite) {
        throw ArgumentError('The share position is unavailable.');
      }
      if (_share != null) {
        await _owned(_share(file.path, bytes.file.contentType.mime, origin));
      } else if (Platform.isLinux) {
        final location = await _owned(
          getSaveLocation(suggestedName: bytes.file.filename),
        );
        _check();
        if (location != null) await file.copy(location.path);
      } else {
        await _owned(
          SharePlus.instance.share(
            ShareParams(
              files: [XFile(file.path, mimeType: bytes.file.contentType.mime)],
              fileNameOverrides: [bytes.file.filename],
              sharePositionOrigin: origin,
            ),
          ),
        );
      }
      _check();
    } finally {
      if (directory != null) await _remove(directory);
    }
  }

  Future<void> _remove(Directory directory) async {
    try {
      if (await directory.exists()) await directory.delete(recursive: true);
    } catch (_) {
      /* OS may also reclaim temporary exports. */
    }
    _directories.remove(directory);
  }

  @override
  Future<void> dispose() async {
    if (!_closed.isCompleted) _closed.complete();
    await Future.wait(_directories.toList().map(_remove))
        .timeout(const Duration(seconds: 1), onTimeout: () => []);
  }
}
