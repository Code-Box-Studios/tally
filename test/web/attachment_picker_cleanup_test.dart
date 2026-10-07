@TestOn('browser')
library;

import 'dart:async';
import 'dart:js_interop';

import 'package:file_selector/file_selector.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:web/web.dart' as web;
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/attachments/data/file_picker_adapter.dart';

void main() {
  String createFile() => web.URL.createObjectURL(web.Blob(['abc'.toJS].toJS));
  test(
    'a completed web selection releases its original file-selector Blob',
    () async {
      final owner = OwnerUid('alice'), url = createFile();
      final picker = AttachmentFilePicker(
        owner: owner,
        currentOwner: () => owner,
        choose: () async => XFile(
          url,
          name: 'receipt.pdf',
          mimeType: 'application/pdf',
          length: 3,
        ),
      );
      final file = await picker.select();
      expect(file!.bytes, [97, 98, 99]);
      await expectLater(web.window.fetch(url.toJS).toDart, throwsA(anything));
    },
  );
  test(
    'an owner-disposed late picker callback also revokes its private Blob',
    () async {
      final owner = OwnerUid('alice'),
          url = createFile(),
          chosen = Completer<XFile?>();
      final picker = AttachmentFilePicker(
        owner: owner,
        currentOwner: () => owner,
        choose: () => chosen.future,
      );
      final pending = picker.select();
      final rejected = expectLater(pending, throwsA(anything));
      await picker.dispose();
      await rejected;
      chosen.complete(
        XFile(url, name: 'receipt.pdf', mimeType: 'application/pdf', length: 3),
      );
      await Future<void>.delayed(Duration.zero);
      await expectLater(web.window.fetch(url.toJS).toDart, throwsA(anything));
    },
  );
}
