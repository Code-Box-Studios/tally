import 'package:tally/features/sync/presentation/sync_providers.dart';

import '../../support/online_commands.dart';

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/config/environment_providers.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/theme/tally_theme.dart';
import 'package:tally/features/attachments/data/attachment_dto.dart';
import 'package:tally/features/attachments/domain/attachment.dart';
import 'package:tally/features/attachments/domain/attachments_repository.dart';
import 'package:tally/features/attachments/presentation/attachment_panel.dart';
import 'package:tally/features/attachments/presentation/attachment_providers.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/obligations/presentation/obligation_detail_screen.dart';
import 'package:tally/shared/domain/data_page.dart';
import 'package:tally/shared/domain/financial_failure.dart';
import 'package:tally/shared/presentation/financial_providers.dart';
import 'package:tally/shared/presentation/private_session_cleanup_provider.dart';
import 'package:tally/features/attachments/presentation/attachment_preview.dart';

import '../auth/session_controller_test.dart' show profile;
import '../financial/financial_dto_test.dart' show obligationData;
import '../financial/financial_forms_test.dart'
    show UiCommands, UiDocuments, enter, tap;
import 'attachment_actions_test.dart' show NoExport, SelectedFile;
import 'attachment_dto_test.dart' show record, ready;
import 'attachment_repository_test.dart' show selected, reservation;

class WidgetFiles implements AttachmentsRepository {
  @override
  final owner = OwnerUid('alice');
  final changes = StreamController<void>.broadcast(sync: true);
  final rows = <Attachment>[];
  final targets = <AttachmentTarget>[];
  final reservations = <CommandId>[];
  bool cached = false, failReserve = false;
  bool hasMore = false;
  int moreCalls = 0;
  Completer<void>? uploading;
  Completer<AttachmentBytes>? downloading;
  DataPage<Attachment> page(AttachmentTarget target) => DataPage(
    items: rows.where((file) => file.target == target),
    nextCursor: hasMore ? WidgetCursor() : null,
    hasMore: hasMore,
    isFromCache: cached,
  );
  @override
  Stream<DataPage<Attachment>> watchTarget(AttachmentTarget target) async* {
    targets.add(target);
    yield page(target);
    yield* changes.stream.map((_) => page(target));
  }

  @override
  Future<DataPage<Attachment>> getTarget(
    AttachmentTarget target, {
    PageCursor? after,
  }) async {
    moreCalls++;
    return DataPage(
      items: [],
      nextCursor: null,
      hasMore: false,
      isFromCache: cached,
    );
  }

  @override
  Future<AttachmentReservation> reserve(
    CommandId id,
    AttachmentReservationInput input,
  ) async {
    reservations.add(id);
    if (failReserve) {
      throw const FinancialFailure(
        FinancialFailureCode.unavailable,
        'Reconnect to attach this file.',
      );
    }
    rows.add(
      AttachmentDto.fromMap('file-1', {
        ...record(),
        'targetType': input.target.type.name,
        'targetId': input.target.id,
      }, owner),
    );
    changes.add(null);
    return reservation(owner);
  }

  @override
  Stream<AttachmentUploadProgress> upload(
    AttachmentReservation reservation,
    AttachmentFileInput file,
  ) async* {
    yield AttachmentUploadProgress(
      id: reservation.id,
      state: AttachmentUploadState.uploading,
      bytesTransferred: 0,
      totalBytes: file.sizeBytes,
    );
    await uploading?.future;
    final old = rows.single;
    rows[0] = AttachmentDto.fromMap('file-1', {
      ...record(),
      'targetType': old.target.type.name,
      'targetId': old.target.id,
      'state': 'awaitingUpload',
    }, owner);
    changes.add(null);
    yield AttachmentUploadProgress(
      id: reservation.id,
      state: AttachmentUploadState.processing,
      bytesTransferred: file.sizeBytes,
      totalBytes: file.sizeBytes,
    );
  }

  @override
  Future<AttachmentBytes> download(AttachmentId id) async => downloading != null
      ? downloading!.future
      : AttachmentBytes(
          owner: owner,
          id: id,
          filename: 'receipt.pdf',
          contentType: AttachmentContentType.pdf,
          bytes: selected().bytes,
        );
  @override
  Future<int> remove(
    CommandId command,
    AttachmentId id, {
    required int expectedRevision,
  }) async {
    final old = rows.single;
    rows[0] = AttachmentDto.fromMap(id.value, {
      ...ready(),
      'targetType': old.target.type.name,
      'targetId': old.target.id,
      'state': 'deleted',
      'revision': 3,
      'removedAt': DateTime.utc(2026, 10, 7),
    }, owner);
    changes.add(null);
    return 3;
  }

  @override
  Future<void> dispose() async {}
}

class WidgetCursor implements PageCursor {}

class CapturedExport extends NoExport {
  AttachmentBytes? saved;
  @override
  Future<void> export(AttachmentBytes bytes) async {
    saved = bytes;
  }
}

Future<void> hostFiles(
  WidgetTester tester,
  WidgetFiles repo, {
  Widget? child,
  bool dark = false,
  double textScale = 1,
  UiDocuments? docs,
  UiCommands? commands,
  NoExport? exporter,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        ownerUidProvider.overrideWithValue(repo.owner),
        attachmentsRepositoryProvider.overrideWithValue(repo),
        attachmentPickerProvider.overrideWithValue(SelectedFile()),
        attachmentExporterProvider.overrideWithValue(exporter ?? NoExport()),
        if (docs != null) ...[
          environmentProvider.overrideWithValue(
            const EnvironmentConfig.emulator(projectId: 'demo-tally'),
          ),
          userProfileProvider.overrideWithValue(profile('alice')),
          ownerDocumentsFactoryProvider.overrideWithValue((_) => docs),
          syncRuntimeFactoryProvider.overrideWithValue(onlineOnlyTestRuntime),
          ownerCommandsFactoryProvider.overrideWithValue((_) => commands!),
        ],
      ],
      child: MaterialApp(
        theme: dark ? TallyTheme.dark() : TallyTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        home: Scaffold(
          body: SingleChildScrollView(
            child:
                child ??
                AttachmentPanel(
                  target: AttachmentTarget.forPayment(PaymentId('payment-1')),
                  initiallyExpanded: true,
                ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  final target = AttachmentTarget.forPayment(PaymentId('payment-1'));
  testWidgets(
    'stopping an uncertain retry releases selection for another target without deleting history',
    (tester) async {
      final repo = WidgetFiles()..failReserve = true;
      addTearDown(repo.changes.close);
      await hostFiles(
        tester,
        repo,
        child: Column(
          children: [
            AttachmentPanel(target: target, initiallyExpanded: true),
            AttachmentPanel(
              target: AttachmentTarget.forObligation(ObligationId('loan-1')),
              initiallyExpanded: true,
            ),
          ],
        ),
      );
      await tester.tap(find.text('Add file').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Stop retrying'));
      await tester.pumpAndSettle();
      expect(find.text('Retry upload'), findsNothing);
      repo.failReserve = false;
      await tester.ensureVisible(find.text('Add file').last);
      await tester.tap(find.text('Add file').last);
      await tester.pumpAndSettle();
      expect(repo.reservations[0], isNot(repo.reservations[1]));
      expect(
        repo.rows.single.target,
        AttachmentTarget.forObligation(ObligationId('loan-1')),
      );
    },
  );
  testWidgets(
    'sign-out preparation clears a displayed private image and its decoded cache',
    (tester) async {
      final repo = WidgetFiles();
      addTearDown(repo.changes.close);
      final png = base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      );
      final imageBytes = AttachmentBytes(
        owner: repo.owner,
        id: AttachmentId('file-1'),
        filename: 'receipt.png',
        contentType: AttachmentContentType.png,
        bytes: Uint8List.fromList(png),
      );
      await hostFiles(
        tester,
        repo,
        child: Builder(
          builder: (context) => TextButton(
            onPressed: () => showDialog<void>(
              context: context,
              builder: (_) =>
                  Dialog(child: AttachmentPreview(bytes: imageBytes)),
            ),
            child: const Text('Preview'),
          ),
        ),
      );
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(find.byType(Image), findsOneWidget);
      final image = tester.widget<Image>(find.byType(Image)).image;
      final key = await image.obtainKey(ImageConfiguration.empty);
      expect(PaintingBinding.instance.imageCache.containsKey(key), isTrue);
      final container = ProviderScope.containerOf(
        tester.element(find.byType(AttachmentPreview)),
      );
      await container
          .read(privateSessionCleanupProvider)
          .prepareSignOut(repo.owner);
      await tester.pumpAndSettle();
      expect(find.byType(Image), findsNothing);
      expect(find.text('Private file closed'), findsOneWidget);
      expect(PaintingBinding.instance.imageCache.containsKey(key), isFalse);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'large pixel images skip decoding and still export original bytes',
    (tester) async {
      final repo = WidgetFiles();
      addTearDown(repo.changes.close);
      final original = File('test/fixtures/attachments/large-pixels.png')
          .readAsBytesSync();
      expect(original.length, lessThan(10485760));
      final bytes = AttachmentBytes(
        owner: repo.owner,
        id: AttachmentId('file-1'),
        filename: 'large.png',
        contentType: AttachmentContentType.png,
        bytes: original,
      );
      final exporter = CapturedExport();
      await hostFiles(
        tester,
        repo,
        exporter: exporter,
        child: AttachmentPreview(bytes: bytes),
      );
      await tester.pump();
      expect(find.byType(Image), findsNothing);
      expect(
        find.text(
          'Image preview is unavailable. You can save or share the original file.',
        ),
        findsOneWidget,
      );
      await tester.tap(find.text('Save or share'));
      await tester.pumpAndSettle();
      expect(exporter.saved?.file.bytes, orderedEquals(original));
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('safe image preview decodes within its pixel cache limit', (
    tester,
  ) async {
    final repo = WidgetFiles();
    addTearDown(repo.changes.close);
    final bytes = AttachmentBytes(
      owner: repo.owner,
      id: AttachmentId('file-1'),
      filename: 'safe.png',
      contentType: AttachmentContentType.png,
      bytes: File('test/fixtures/attachments/preview-safe.png')
          .readAsBytesSync(),
    );
    await hostFiles(tester, repo, child: AttachmentPreview(bytes: bytes));
    final provider = tester.widget<Image>(find.byType(Image)).image;
    final decoded = Completer<ImageInfo>();
    final listener = ImageStreamListener(
      (info, _) {
        if (!decoded.isCompleted) decoded.complete(info.clone());
      },
      onError: (error, stack) {
        if (!decoded.isCompleted) decoded.completeError(error, stack);
      },
    );
    final stream = provider.resolve(ImageConfiguration.empty);
    stream.addListener(listener);
    try {
      // Image streams deliver decoded frames on the scheduler's next frame.
      for (var i = 0; i < 100 && !decoded.isCompleted; i++) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 10)),
        );
        await tester.pump();
      }
      expect(decoded.isCompleted, isTrue);
    } finally {
      stream.removeListener(listener);
    }
    final info = await decoded.future;
    expect(info.image.width, 1024);
    expect(info.image.height, 768);
    info.dispose();
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'collapsed sections do not subscribe; keyboard opens labelled file actions',
    (tester) async {
      final repo = WidgetFiles();
      addTearDown(repo.changes.close);
      await hostFiles(tester, repo, child: AttachmentPanel(target: target));
      expect(repo.targets, isEmpty);
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pumpAndSettle();
      expect(repo.targets, [target]);
      expect(find.text('Add file'), findsOneWidget);
      expect(find.text('JPEG, PNG, WebP or PDF · up to 10 MB'), findsOneWidget);
    },
  );
  testWidgets(
    'uploading then processing stays unavailable until ready; explicit preview export and removal',
    (tester) async {
      final repo = WidgetFiles()..uploading = Completer();
      final exporter = NoExport();
      addTearDown(repo.changes.close);
      await hostFiles(tester, repo, exporter: exporter);
      await tester.tap(find.text('Add file'));
      await tester.pump();
      await tester.pump();
      expect(find.textContaining('Uploading'), findsWidgets);
      expect(find.byKey(const Key('preview-file-1')), findsNothing);
      repo.uploading!.complete();
      await tester.pumpAndSettle();
      expect(find.text('Checking file'), findsWidgets);
      repo.rows[0] = AttachmentDto.fromMap('file-1', ready(), repo.owner);
      repo.changes.add(null);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('preview-file-1')));
      await tester.pumpAndSettle();
      expect(find.text('PDF ready to save'), findsOneWidget);
      expect(exporter.count, 0);
      await tester.tap(find.text('Save or share'));
      await tester.pumpAndSettle();
      expect(exporter.count, 1);
      await tester.tap(find.text('Close'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('remove-file-1')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remove file').last);
      await tester.pumpAndSettle();
      expect(find.text('Attachment removed'), findsOneWidget);
      expect(find.byKey(const Key('preview-file-1')), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'cached rejected records explain retry limits and paginate without claiming live truth',
    (tester) async {
      final repo = WidgetFiles()
        ..cached = true
        ..hasMore = true;
      addTearDown(repo.changes.close);
      repo.rows.add(
        AttachmentDto.fromMap('file-1', {
          ...record(),
          'state': 'rejected',
          'rejectionReason': 'unsupportedFormat',
        }, repo.owner),
      );
      await hostFiles(tester, repo);
      expect(find.textContaining('Cached view'), findsOneWidget);
      expect(find.textContaining('Choose a supported'), findsOneWidget);
      expect(find.byKey(const Key('preview-file-1')), findsNothing);
      await tester.tap(find.text('Load more'));
      await tester.pumpAndSettle();
      expect(repo.moreCalls, 1);
      repo.cached = false;
      repo.changes.add(null);
      await tester.pumpAndSettle();
      expect(find.textContaining('Cached view'), findsNothing);
    },
  );
  testWidgets(
    'uncertain upload retries the original action and another target names its pending file',
    (tester) async {
      final repo = WidgetFiles()..failReserve = true;
      addTearDown(repo.changes.close);
      await hostFiles(
        tester,
        repo,
        child: Column(
          children: [
            AttachmentPanel(target: target, initiallyExpanded: true),
            AttachmentPanel(
              target: AttachmentTarget.forObligation(ObligationId('loan-1')),
              initiallyExpanded: true,
            ),
          ],
        ),
      );
      await tester.tap(find.text('Add file').first);
      await tester.pumpAndSettle();
      expect(find.text('Reconnect to attach this file.'), findsOneWidget);
      expect(find.text('Retry upload'), findsOneWidget);
      expect(find.text('Retry upload'), findsOneWidget);
      expect(find.textContaining('Finish the pending file'), findsOneWidget);
      repo.failReserve = false;
      await tester.tap(find.text('Retry upload'));
      await tester.pumpAndSettle();
      expect(repo.reservations[0], repo.reservations[1]);
      expect(repo.rows.single.target, target);
    },
  );
  testWidgets(
    'accepted payment followed by failed receipt leaves one canonical payment and its balance',
    (tester) async {
      final repo = WidgetFiles()..failReserve = true,
          docs = UiDocuments(),
          commands = UiCommands(docs);
      addTearDown(repo.changes.close);
      addTearDown(docs.changes.close);
      docs.data['obligations']!['loan-1'] = {
        ...obligationData(),
        'totalPaidMinor': 0,
        'remainingMinor': 1000000,
        'financialStatus': 'pending',
        'hasPaymentHistory': false,
      };
      await hostFiles(
        tester,
        repo,
        docs: docs,
        commands: commands,
        child: ObligationDetailScreen(id: ObligationId('loan-1')),
      );
      await tap(tester, 'record-payment');
      await enter(tester, 'payment-amount', '3000');
      await enter(tester, 'payment-date', '2026-10-07');
      await tap(tester, 'payment-save');
      final paymentBefore = Map<String, Object?>.of(
        docs.data['payments']!['pay-1']!,
      );
      await tester.ensureVisible(find.text('Receipts'));
      await tester.tap(find.text('Receipts'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Add file'));
      await tester.tap(find.text('Add file'));
      await tester.pumpAndSettle();
      expect(find.text('Reconnect to attach this file.'), findsOneWidget);
      expect(commands.requests, ['recordPayment']);
      expect(docs.data['payments']!['pay-1'], paymentBefore);
      expect(docs.data['payments']!.length, 1);
      expect(docs.data['obligations']!['loan-1']!['remainingMinor'], 700000);
      expect(find.text('₱7,000 PHP'), findsWidgets);
    },
  );
  testWidgets(
    'late private preview result cannot open after its owner workspace is removed',
    (tester) async {
      final repo = WidgetFiles()..downloading = Completer();
      addTearDown(repo.changes.close);
      repo.rows.add(AttachmentDto.fromMap('file-1', ready(), repo.owner));
      await hostFiles(tester, repo);
      await tester.tap(find.byKey(const Key('preview-file-1')));
      await tester.pump();
      await tester.pumpWidget(const MaterialApp(home: Text('Signed out')));
      repo.downloading!.complete(
        AttachmentBytes(
          owner: repo.owner,
          id: AttachmentId('file-1'),
          filename: 'receipt.pdf',
          contentType: AttachmentContentType.pdf,
          bytes: selected().bytes,
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('PDF ready to save'), findsNothing);
      expect(find.text('Signed out'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  for (final width in [320.0, 375.0, 800.0, 1440.0]) {
    for (final dark in [false, true]) {
      testWidgets(
        'files fit $width ${dark ? 'dark' : 'light'} at 200 percent text',
        (tester) async {
          await tester.binding.setSurfaceSize(Size(width, 1600));
          addTearDown(() => tester.binding.setSurfaceSize(null));
          final repo = WidgetFiles();
          addTearDown(repo.changes.close);
          repo.rows.add(
            AttachmentDto.fromMap('file-1', {
              ...ready(),
              'filename': 'A very long monthly billing statement with payment evidence.pdf',
            }, repo.owner),
          );
          await hostFiles(tester, repo, dark: dark, textScale: 2);
          expect(find.text('Ready'), findsOneWidget);
          await tester.ensureVisible(find.byKey(const Key('preview-file-1')));
          await tester.tap(find.byKey(const Key('preview-file-1')));
          await tester.pumpAndSettle();
          expect(find.text('PDF ready to save'), findsOneWidget);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}
