@TestOn('browser')
library;

import 'dart:async';
import 'dart:js_interop';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:web/web.dart' as web;
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/attachments/data/attachment_export_web.dart';
import 'package:tally/features/attachments/domain/attachment.dart';

void main() {
  final alice = OwnerUid('alice');
  OwnerUid? current = alice;
  AttachmentBytes file(OwnerUid owner) => AttachmentBytes(
    owner: owner,
    id: AttachmentId('file-1'),
    filename: 'receipt.pdf',
    contentType: AttachmentContentType.pdf,
    bytes: Uint8List.fromList([97, 98, 99]),
  );
  setUp(() => current = alice);
  Future<String> exportedUrl(Future<void> Function() action) async {
    final found = Completer<String>();
    final observer = web.MutationObserver(
      ((JSArray<web.MutationRecord> records, web.MutationObserver _) {
        for (final record in records.toDart) {
          for (var i = 0; i < record.addedNodes.length; i++) {
            final node = record.addedNodes.item(i);
            if (node?.nodeName == 'A' && !found.isCompleted) {
              found.complete((node as web.HTMLAnchorElement).href);
            }
          }
        }
      }).toJS,
    );
    observer.observe(
      web.document.body!,
      web.MutationObserverInit(childList: true),
    );
    try {
      unawaited(action());
      return await found.future.timeout(const Duration(seconds: 5));
    } finally {
      observer.disconnect();
    }
  }

  test(
    'explicit web export uses a real local Blob and revokes it after download',
    () async {
      final exporter = WebAttachmentExporter(
        owner: alice,
        currentOwner: () => current,
      );
      Future<void>? exported;
      final url = await exportedUrl(
        () => exported = exporter.export(file(alice)),
      );
      expect(url, startsWith('blob:'));
      final response = await web.window.fetch(url.toJS).toDart;
      expect(await response.text().toDart.then((value) => value.toDart), 'abc');
      await exported;
      await expectLater(web.window.fetch(url.toJS).toDart, throwsA(anything));
      await exporter.dispose();
    },
  );
  test('owner disposal revokes a pending local export and rejects its late completion', () async {
    final exporter = WebAttachmentExporter(
      owner: alice,
      currentOwner: () => current,
    );
    Future<void>? exported;
    Future<void>? rejected;
    final url = await exportedUrl(() {
      exported = exporter.export(file(alice));
      rejected = expectLater(exported, throwsA(anything));
      return Future.value();
    });
    await exporter.dispose();
    await expectLater(web.window.fetch(url.toJS).toDart, throwsA(anything));
    await rejected;
    expect(web.document.querySelectorAll('a[download]').length, 0);
  });
  test('another owner cannot create a Blob export', () async {
    final exporter = WebAttachmentExporter(
      owner: alice,
      currentOwner: () => current,
    );
    await expectLater(
      exporter.export(file(OwnerUid('bob'))),
      throwsArgumentError,
    );
    current = OwnerUid('bob');
    await expectLater(exporter.export(file(alice)), throwsA(anything));
    await exporter.dispose();
  });
}
