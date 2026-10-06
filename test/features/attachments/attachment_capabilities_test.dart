import 'dart:async';
import 'dart:typed_data';
import 'dart:io';
import 'dart:ui';

import 'package:file_selector/file_selector.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/attachments/data/file_picker_adapter.dart';
import 'package:tally/features/attachments/data/attachment_export_native.dart';
import 'package:tally/features/attachments/domain/attachment.dart';

void main() {
  final alice = OwnerUid('alice');
  OwnerUid? current = alice;
  setUp(() => current = alice);
  test(
    'picker validates safe filename and bounded size before opening bytes',
    () async {
      final temp = await Directory.systemTemp.createTemp('tally-picker-test-');
      addTearDown(() => temp.delete(recursive: true));
      final source = await File('${temp.path}/receipt.pdf')
          .writeAsBytes([97, 98, 99]);
      final picker = AttachmentFilePicker(
        owner: alice,
        currentOwner: () => current,
        choose: () async => XFile(source.path, mimeType: 'application/pdf'),
      );
      final result = await picker.select();
      expect(result!.filename, 'receipt.pdf');
      expect(result.contentType, AttachmentContentType.pdf);
      expect(result.bytes, [97, 98, 99]);
      final unsafeFile = await File('${temp.path}/unsafe\n.pdf')
          .writeAsBytes([1]);
      final unsafe = AttachmentFilePicker(
        owner: alice,
        currentOwner: () => current,
        choose: () async => XFile(unsafeFile.path, mimeType: 'application/pdf'),
      );
      await expectLater(unsafe.select(), throwsA(anything));
      final hugeFile = await File('${temp.path}/large.pdf')
          .writeAsBytes(Uint8List(10485761));
      final huge = AttachmentFilePicker(
        owner: alice,
        currentOwner: () => current,
        choose: () async => XFile(hugeFile.path, mimeType: 'application/pdf'),
      );
      await expectLater(
        huge.select(),
        throwsA(
          isA<ArgumentError>().having(
            (error) => error.message,
            'limit',
            contains('10 MiB'),
          ),
        ),
      );
    },
  );
  test('a cancelled picker returns no file and a switched owner rejects late selection', () async {
    final cancelled = AttachmentFilePicker(
      owner: alice,
      currentOwner: () => current,
      choose: () async => null,
    );
    expect(await cancelled.select(), isNull);
    final result = Completer<XFile?>(),
        picker = AttachmentFilePicker(
          owner: alice,
          currentOwner: () => current,
          choose: () => result.future,
        );
    final selected = picker.select(),
        rejection = expectLater(selected, throwsA(anything));
    current = OwnerUid('bob');
    result.complete(
      XFile.fromData(
        Uint8List.fromList([97, 98, 99]),
        mimeType: 'application/pdf',
        name: 'receipt.pdf',
      ),
    );
    await rejection;
  });
  test(
    'picker disposal ends a pending platform dialog without awaiting its reply',
    () async {
      final result = Completer<XFile?>(),
          picker = AttachmentFilePicker(
            owner: alice,
            currentOwner: () => current,
            choose: () => result.future,
          );
      final selected = picker.select(),
          rejection = expectLater(selected, throwsA(anything));
      await picker.dispose().timeout(const Duration(milliseconds: 200));
      await rejection;
      result.complete(null);
    },
  );
  test('native export shares an owned temporary file with an iPad origin and cleans it', () async {
    final temp = await Directory.systemTemp.createTemp('tally-export-test-');
    addTearDown(() => temp.delete(recursive: true));
    String? shared;
    Rect? origin;
    final exporter = NativeAttachmentExporter(
      owner: alice,
      currentOwner: () => current,
      temporaryDirectory: () async => temp,
      origin: () => const Rect.fromLTWH(10, 20, 30, 40),
      share: (path, mime, rect) async {
        shared = path;
        origin = rect;
        expect(await File(path).readAsBytes(), [97, 98, 99]);
        expect(mime, 'application/pdf');
      },
    );
    await exporter.export(
      AttachmentBytes(
        owner: alice,
        id: AttachmentId('file-1'),
        filename: 'receipt.pdf',
        contentType: AttachmentContentType.pdf,
        bytes: Uint8List.fromList([97, 98, 99]),
      ),
    );
    expect(origin, const Rect.fromLTWH(10, 20, 30, 40));
    expect(shared, contains('/alice/'));
    expect(await File(shared!).exists(), isFalse);
    await exporter.dispose();
  });
  test('owner switch during temporary-file creation prevents a share and removes bytes', () async {
    final temp = await Directory.systemTemp.createTemp('tally-export-race-');
    addTearDown(() => temp.delete(recursive: true));
    var shares = 0;
    final exporter = NativeAttachmentExporter(
      owner: alice,
      currentOwner: () => current,
      temporaryDirectory: () async {
        current = OwnerUid('bob');
        return temp;
      },
      origin: () => const Rect.fromLTWH(10, 20, 30, 40),
      share: (_, _, _) async {
        shares++;
      },
    );
    await expectLater(
      exporter.export(
        AttachmentBytes(
          owner: alice,
          id: AttachmentId('file-1'),
          filename: 'receipt.pdf',
          contentType: AttachmentContentType.pdf,
          bytes: Uint8List.fromList([97, 98, 99]),
        ),
      ),
      throwsA(anything),
    );
    expect(shares, 0);
    expect(
      await temp.list(recursive: true).where((entry) => entry is File).length,
      0,
    );
    await exporter.dispose();
  });
  test('an empty platform MIME uses the supported filename type without trusting file bytes', () async {
    final temp = await Directory.systemTemp.createTemp('tally-picker-mime-');
    addTearDown(() => temp.delete(recursive: true));
    final source = await File('${temp.path}/receipt.pdf')
        .writeAsBytes([97, 98, 99]);
    final picker = AttachmentFilePicker(
      owner: alice,
      currentOwner: () => current,
      choose: () async => XFile(source.path, mimeType: ''),
    );
    expect((await picker.select())!.contentType, AttachmentContentType.pdf);
  });
}
