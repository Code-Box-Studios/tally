import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/session/private_session_cleanup.dart';
import 'package:tally/features/attachments/domain/attachment.dart';
import 'package:tally/features/attachments/domain/attachment_capabilities.dart';
import 'package:tally/features/attachments/presentation/attachment_providers.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/sync/data/pending_evidence_database.dart';
import 'package:tally/features/sync/data/pending_evidence_memory.dart';
import 'package:tally/features/sync/data/pending_evidence_sqlite.dart';
import 'package:tally/features/sync/domain/pending_evidence.dart';
import 'package:tally/features/sync/domain/sync_capability.dart';
import 'package:tally/features/sync/presentation/pending_evidence_providers.dart';
import 'package:tally/features/sync/presentation/sync_providers.dart';
import 'package:tally/shared/presentation/financial_providers.dart';
import 'package:tally/shared/presentation/private_session_cleanup_provider.dart';

import '../financial/repository_paging_test.dart' show FakeCommands;

final class HeldFiles implements PendingEvidenceFiles {
  final gate = Completer<void>();
  final memory = MemoryPendingReceiptFiles();
  @override
  bool get bytesSurviveRestart => false;
  @override
  Future<void> prepare(List<PendingEvidence> values) => memory.prepare(values);
  @override
  Future<void> put(PendingEvidence value, AttachmentFileInput file) =>
      memory.put(value, file);
  @override
  Future<AttachmentFileInput> read(PendingEvidence value) => memory.read(value);
  @override
  Future<void> remove(PendingEvidence value) => memory.remove(value);
  @override
  Future<void> close() async {
    await gate.future;
    await memory.close();
  }
}

final class HeldAttachment implements AttachmentPicker, AttachmentExporter {
  final gate = Completer<void>();
  bool fail = false;
  @override
  Future<AttachmentFileInput?> select() async => null;
  @override
  Future<void> export(AttachmentBytes bytes) async {}
  @override
  Future<void> dispose() async {
    if (fail) throw StateError('Synthetic close failure');
    await gate.future;
  }
}

void main() {
  final alice = OwnerUid('resources-alice');
  late ProviderContainer root;
  late PrivateSessionCleanup cleanup;
  setUp(() {
    cleanup = PrivateSessionCleanup();
    root = ProviderContainer(
      overrides: [
        privateSessionCleanupProvider.overrideWithValue(cleanup),
        ownerCommandsFactoryProvider.overrideWithValue(
          (owner) => FakeCommands(owner),
        ),
        trustedDeviceChoiceProvider.overrideWith((_) async => true),
        syncEnvironmentProvider.overrideWithValue('emulator-demo-tally'),
      ],
    );
  });
  tearDown(() => root.dispose());
  ProviderContainer scope(List<Override> overrides) => ProviderContainer(
    parent: root,
    overrides: [ownerUidProvider.overrideWithValue(alice), ...overrides],
  );
  Future<void> settle() =>
      Future<void>.delayed(const Duration(milliseconds: 20));

  test('deletion awaits an in-flight runtime construction after owner scope disposal', () async {
    final started = Completer<void>(), release = Completer<void>();
    SyncRuntime? created;
    final child = scope([
      syncRuntimeFactoryProvider.overrideWithValue((
        owner,
        env,
        trusted,
        raw,
        active,
      ) async {
        started.complete();
        await release.future;
        return created = SyncRuntime(
          owner: owner,
          capability: const SyncCapability(SyncAvailability.unavailable),
          gateway: raw,
        );
      }),
    ]);
    final future = child.read(syncRuntimeProvider.future);
    unawaited(future.then<void>((_) {}, onError: (Object _, StackTrace _) {}));
    await started.future;
    child.dispose();
    var finished = false;
    final deleting = cleanup
        .quiesceForDeletion(alice)
        .then((_) => finished = true);
    await settle();
    final premature = finished;
    release.complete();
    await deleting;
    await settle();
    expect(premature, isFalse);
    expect(created!.isDisposed, isTrue);
  });

  for (final constructing in [true, false]) {
    test(
      'deletion awaits ${constructing ? 'constructing' : 'retired'} receipt storage after scope disposal',
      () async {
        final started = Completer<void>(),
            release = Completer<void>(),
            files = HeldFiles();
        final store = SqlitePendingEvidenceStore(
          PendingEvidenceDatabase(NativeDatabase.memory()),
          files,
          alice,
          'emulator-demo-tally',
        );
        await store.initialize();
        addTearDown(() async {
          if (!files.gate.isCompleted) files.gate.complete();
          await store.close();
        });
        final child = scope([
          pendingEvidenceFactoryProvider.overrideWithValue(({
            required owner,
            required environmentKey,
            required trustedDevice,
          }) async {
            started.complete();
            if (constructing) await release.future;
            return store;
          }),
        ]);
        final future = child.read(pendingEvidenceStoreProvider.future);
        unawaited(
          future.then<void>((_) {}, onError: (Object _, StackTrace _) {}),
        );
        await started.future;
        if (!constructing) await future;
        child.dispose();
        var finished = false;
        final deleting = cleanup
            .quiesceForDeletion(alice)
            .then((_) => finished = true);
        await settle();
        final beforeConstruction = finished;
        release.complete();
        await settle();
        final beforeClose = finished;
        files.gate.complete();
        await deleting;
        expect(beforeConstruction, isFalse);
        expect(beforeClose, isFalse);
      },
    );
  }

  for (final picker in [true, false]) {
    test(
      'deletion awaits retired attachment ${picker ? 'picker' : 'exporter'} without a timeout success',
      () async {
        final held = HeldAttachment();
        final child = scope([
          attachmentPickerFactoryProvider.overrideWithValue((_) => held),
          attachmentExporterFactoryProvider.overrideWithValue((_) => held),
        ]);
        if (picker) {
          child.read(attachmentPickerProvider);
        } else {
          child.read(attachmentExporterProvider);
        }
        child.dispose();
        var finished = false;
        final deleting = cleanup
            .quiesceForDeletion(alice)
            .then((_) => finished = true);
        await settle();
        final premature = finished;
        held.gate.complete();
        await deleting;
        expect(premature, isFalse);
      },
    );
  }
  test('a retired attachment close failure blocks erasure instead of being swallowed', () async {
    final held = HeldAttachment()..fail = true;
    final child = scope([
      attachmentPickerFactoryProvider.overrideWithValue((_) => held),
    ]);
    child.read(attachmentPickerProvider);
    child.dispose();
    await expectLater(
      cleanup.quiesceForDeletion(alice),
      throwsA(isA<StateError>()),
    );
  });
}
