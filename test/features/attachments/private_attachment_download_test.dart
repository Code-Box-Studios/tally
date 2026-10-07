import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/attachments/data/private_attachment_download.dart';
import 'package:tally/shared/data/owner_command_gateway.dart';

final class ReadCommands implements OwnerCommandGateway {
  @override
  OwnerUid get owner => OwnerUid('reader');
  final calls = <(String, CommandId, Map<String, Object?>)>[];
  Future<Map<String, Object?>> Function()? response;
  @override
  Future<Map<String, Object?>> call(
    String name,
    CommandId command,
    Map<String, Object?> payload,
  ) async {
    calls.add((name, command, payload));
    return response == null ? valid() : response!();
  }
}

Map<String, Object?> valid() => {
  'attachmentId': 'file',
  'storageGeneration': '99999999999999999999',
  'contentBase64': base64Encode([1, 2, 3]),
};

void main() {
  test(
    'private download uses only the owned callable and canonical bounded bytes',
    () async {
      final commands = ReadCommands();
      final download = PrivateAttachmentDownload(commands, checkOwner: () {});
      expect(
        await download.download(AttachmentId('file'), maxBytes: 10),
        Uint8List.fromList([1, 2, 3]),
      );
      expect(commands.calls.single.$1, 'downloadAttachment');
      expect(commands.calls.single.$3, {'attachmentId': 'file'});
      await download.dispose();
    },
  );
  test('private download rejects mismatched identity, generation, extra keys and malformed base64', () async {
    for (final patch in [
      {'attachmentId': 'foreign'},
      {'storageGeneration': 9007199254740992},
      {'storageGeneration': '0'},
      {'storageGeneration': '1', 'url': 'https://example.test'},
      {'contentBase64': 'AQID\n'},
      {'contentBase64': 'AQI='},
      {'contentBase64': ''},
    ]) {
      final commands = ReadCommands()
        ..response = (() async => {...valid(), ...patch});
      final download = PrivateAttachmentDownload(commands, checkOwner: () {});
      final maxBytes = patch['contentBase64'] == 'AQI=' ? 1 : 10;
      await expectLater(
        download.download(AttachmentId('file'), maxBytes: maxBytes),
        throwsA(anything),
      );
      await download.dispose();
    }
  });
  test(
    'owner change while a callable is pending discards late private bytes',
    () async {
      var active = true;
      final response = Completer<Map<String, Object?>>();
      final commands = ReadCommands()..response = (() => response.future);
      final download = PrivateAttachmentDownload(
        commands,
        checkOwner: () {
          if (!active) throw StateError('Old owner');
        },
      );
      final read = download.download(AttachmentId('file'), maxBytes: 10);
      active = false;
      response.complete(valid());
      await expectLater(read, throwsStateError);
      await download.dispose();
    },
  );
  test(
    'disposal completes pending reads promptly and fences later responses',
    () async {
      final response = Completer<Map<String, Object?>>();
      final commands = ReadCommands()..response = (() => response.future);
      final download = PrivateAttachmentDownload(commands, checkOwner: () {});
      final read = download.download(AttachmentId('file'), maxBytes: 10);
      final assertion = expectLater(read, throwsA(anything));
      await download.dispose();
      await assertion;
      response.complete(valid());
      await Future<void>.delayed(Duration.zero);
      await expectLater(
        download.download(AttachmentId('file'), maxBytes: 10),
        throwsA(anything),
      );
    },
  );
  test(
    'invalid bounds and a missing owner fail before any callable request',
    () async {
      final commands = ReadCommands();
      final download = PrivateAttachmentDownload(
        commands,
        checkOwner: () {
          throw StateError('Missing owner');
        },
      );
      await expectLater(
        download.download(AttachmentId('file'), maxBytes: 0),
        throwsA(anything),
      );
      await expectLater(
        download.download(AttachmentId('file'), maxBytes: 10485761),
        throwsA(anything),
      );
      await expectLater(
        download.download(AttachmentId('file'), maxBytes: 10),
        throwsA(anything),
      );
      expect(commands.calls, isEmpty);
      await download.dispose();
    },
  );
}
