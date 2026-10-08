import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/sync/data/pending_evidence_database.dart';
import 'package:tally/features/sync/data/pending_evidence_memory.dart';
import 'package:tally/features/sync/data/pending_evidence_sqlite.dart';
import 'package:tally/features/sync/domain/pending_evidence.dart';

import 'pending_evidence_store_test.dart' show receipt;

void main() {
  test('browser metadata survives reopening while bytes require explicit original-file reselection', () async {
    final root = await Directory.systemTemp.createTemp(
      'tally-web-receipt-contract-',
    );
    Future<SqlitePendingEvidenceStore> open() async {
      final value = SqlitePendingEvidenceStore(
        PendingEvidenceDatabase(
          NativeDatabase.createInBackground(
            File('${root.path}/metadata.sqlite'),
          ),
        ),
        MemoryPendingReceiptFiles(),
        OwnerUid('alice'),
        'emulator-demo-tally',
      );
      await value.initialize();
      return value;
    }

    var store = await open();
    try {
      final id = CommandId('web-payment');
      final saved = await store.persist(id, receipt());
      expect(store.bytesSurviveRestart, isFalse);
      await store.close();
      store = await open();
      expect((await store.get(id))!.uploadCommandId, saved.uploadCommandId);
      await expectLater(
        store.readFile(id),
        throwsA(
          isA<PendingEvidenceFailure>().having(
            (failure) => failure.code,
            'reason',
            PendingEvidenceFailureCode.reselect,
          ),
        ),
      );
      await expectLater(
        store.persist(id, receipt(2)),
        throwsA(isA<PendingEvidenceFailure>()),
      );
      await store.persist(id, receipt());
      expect((await store.readFile(id)).sha256, saved.sha256);
      await store.persist(CommandId('second-web-payment'), receipt(3));
      await expectLater(
        store.readFile(id),
        throwsA(isA<PendingEvidenceFailure>()),
      );
      expect((await store.list()).length, 2);
    } finally {
      await store.close();
      await root.delete(recursive: true);
    }
  });
}
