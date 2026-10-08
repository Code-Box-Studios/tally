import 'dart:async';

import 'package:drift/native.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/attachments/domain/attachment.dart';
import 'package:tally/features/attachments/domain/attachment_capabilities.dart';
import 'package:tally/features/attachments/presentation/attachment_providers.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/sync/data/pending_evidence_database.dart';
import 'package:tally/features/sync/data/pending_evidence_memory.dart';
import 'package:tally/features/sync/data/pending_evidence_sqlite.dart';
import 'package:tally/features/sync/presentation/pending_evidence_coordinator.dart';
import 'package:tally/features/sync/presentation/pending_evidence_providers.dart';
import 'package:tally/features/sync/presentation/pending_receipt_picker.dart';

import 'pending_evidence_coordinator_test.dart' show ReceiptRepository;
import 'pending_evidence_store_test.dart' show receipt;

class ReceiptPicker implements AttachmentPicker {
  @override
  Future<AttachmentFileInput?> select() async => receipt();
  @override
  Future<void> dispose() async {}
}

class HeldReceiptPicker implements AttachmentPicker {
  final selected = Completer<AttachmentFileInput?>();
  bool closed = false;
  @override
  Future<AttachmentFileInput?> select() => selected.future;
  @override
  Future<void> dispose() async {
    closed = true;
  }
}

void main() {
  testWidgets(
    'a receipt selection keeps its owned picker alive while the system chooser waits',
    (tester) async {
      final picker = HeldReceiptPicker();
      AttachmentFileInput? selected;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ownerUidProvider.overrideWithValue(OwnerUid('alice')),
            attachmentPickerProvider.overrideWith((ref) {
              ref.onDispose(() => picker.dispose());
              return picker;
            }),
          ],
          child: MaterialApp(
            home: Scaffold(
              body: PendingReceiptPicker(onChanged: (file) => selected = file),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Add receipt (optional)'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 10));
      expect(picker.closed, isFalse);
      picker.selected.complete(receipt());
      await tester.pumpAndSettle();
      expect(selected, isNotNull);
      expect(find.text('receipt.png'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
      expect(picker.closed, isTrue);
    },
  );
  testWidgets(
    'pending receipt stays separate from money, works at all widths/themes/200 percent and can be removed independently',
    (tester) async {
      final files = ReceiptRepository(), id = CommandId('queued-payment');
      final store = SqlitePendingEvidenceStore(
        PendingEvidenceDatabase(NativeDatabase.memory()),
        MemoryPendingReceiptFiles(),
        files.owner,
        'emulator-demo-tally',
      );
      await store.initialize();
      final coordinator = PendingEvidenceCoordinator(
        store: store,
        attachments: files,
        resolvePayment: (_) async => null,
        isOwnerActive: () => true,
      );
      addTearDown(() async {
        await coordinator.dispose();
        await store.close();
        await files.changes.close();
      });
      addTearDown(tester.view.reset);
      for (final width in [360.0, 800.0, 1440.0]) {
        for (final brightness in [Brightness.light, Brightness.dark]) {
          tester.view.physicalSize = Size(width, 1200);
          tester.view.devicePixelRatio = 1;
          await tester.pumpWidget(
            ProviderScope(
              overrides: [
                ownerUidProvider.overrideWithValue(files.owner),
                attachmentPickerProvider.overrideWithValue(ReceiptPicker()),
                pendingEvidenceStoreProvider.overrideWith((_) async => store),
                pendingEvidenceCoordinatorProvider.overrideWith(
                  (_) async => coordinator,
                ),
              ],
              child: MaterialApp(
                theme: ThemeData(brightness: brightness),
                builder: (_, child) => MediaQuery(
                  data: MediaQueryData(
                    size: Size(width, 1200),
                    textScaler: const TextScaler.linear(2),
                  ),
                  child: child!,
                ),
                home: Scaffold(
                  body: SingleChildScrollView(
                    child: PendingReceiptPanel(commandId: id),
                  ),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          if (await store.get(id) == null) {
            await tester.tap(find.text('Choose receipt'));
            await tester.pumpAndSettle();
          }
          expect(find.text('receipt.png'), findsOneWidget);
          expect(find.textContaining('Payment is waiting'), findsOneWidget);
          expect(files.reserveIds, isEmpty);
          expect(files.uploadIds, isEmpty);
          expect(tester.takeException(), isNull);
        }
      }
      await tester.tap(find.text('Remove saved receipt copy'));
      await tester.pumpAndSettle();
      expect(await store.get(id), isNull);
      expect(find.text('Choose receipt'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    },
  );
}
