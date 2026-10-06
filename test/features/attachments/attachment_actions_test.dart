import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/attachments/domain/attachment.dart';
import 'package:tally/features/attachments/domain/attachment_capabilities.dart';
import 'package:tally/features/attachments/presentation/attachment_actions.dart';
import 'package:tally/features/attachments/presentation/attachment_providers.dart';
import 'package:tally/features/attachments/data/firebase_attachments_repository.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/shared/presentation/private_session_cleanup_provider.dart';
import 'package:tally/shared/presentation/financial_providers.dart';

import 'attachment_repository_test.dart';

class SelectedFile implements AttachmentPicker {
  Completer<AttachmentFileInput?>? pending;
  @override
  Future<AttachmentFileInput?> select() async =>
      pending == null ? selected() : pending!.future;
  @override
  Future<void> dispose() async {}
}

class NoExport implements AttachmentExporter {
  int count = 0;
  @override
  Future<void> export(AttachmentBytes bytes) async {
    count++;
  }

  @override
  Future<void> dispose() async {}
}

void main() {
  final owner = OwnerUid('alice'),
      target = AttachmentTarget.forPayment(PaymentId('payment-1'));
  test('uncertain reservation retries its frozen action without picking a second file', () async {
    final commands = FileCommands(owner)..pending = Completer(),
        repo = FirebaseAttachmentsRepository(
          FileDocuments(owner),
          commands,
          FileStorage(owner),
        );
    final container = ProviderContainer.test(
      overrides: [
        ownerUidProvider.overrideWithValue(owner),
        attachmentsRepositoryProvider.overrideWithValue(repo),
        attachmentPickerProvider.overrideWithValue(SelectedFile()),
        attachmentExporterProvider.overrideWithValue(NoExport()),
      ],
    );
    final subscription = container.listen(attachmentActionsProvider, (_, _) {});
    addTearDown(subscription.close);
    final actions = container.read(attachmentActionsProvider.notifier),
        first = actions.select(target);
    await Future<void>.delayed(Duration.zero);
    commands.pending!.completeError(StateError('Synthetic uncertain response'));
    await first;
    expect(container.read(attachmentActionsProvider).canRetry, isTrue);
    expect(
      container.read(attachmentActionsProvider).phase,
      AttachmentActionPhase.failed,
    );
    commands.pending = null;
    await actions.retry();
    expect(commands.calls[0].$2, commands.calls[1].$2);
    expect(commands.calls[0].$3, commands.calls[1].$3);
    expect(
      container.read(attachmentActionsProvider).phase,
      AttachmentActionPhase.processing,
    );
    expect(container.read(attachmentActionsProvider).canRetry, isFalse);
  });
  test('owner scope disposal during selection cannot reserve or update the next owner', () async {
    final picker = SelectedFile()..pending = Completer(),
        commands = FileCommands(owner),
        repo = FirebaseAttachmentsRepository(
          FileDocuments(owner),
          commands,
          FileStorage(owner),
        );
    final container = ProviderContainer(
      overrides: [
        ownerUidProvider.overrideWithValue(owner),
        attachmentsRepositoryProvider.overrideWithValue(repo),
        attachmentPickerProvider.overrideWithValue(picker),
        attachmentExporterProvider.overrideWithValue(NoExport()),
      ],
    );
    container.listen(attachmentActionsProvider, (_, _) {});
    final pending = container
        .read(attachmentActionsProvider.notifier)
        .select(target);
    container.dispose();
    picker.pending!.complete(selected());
    await pending;
    expect(commands.calls, isEmpty);
  });
  test('sign-out cleanup closes owner files even while the capability cancel is pending', () async {
    final documents = FileDocuments(owner),
        commands = FileCommands(owner),
        storage = FileStorage(owner)..pendingDispose = Completer();
    final container = ProviderContainer.test(
      overrides: [
        ownerUidProvider.overrideWithValue(owner),
        attachmentStorageFactoryProvider.overrideWithValue((_) => storage),
        attachmentPickerFactoryProvider.overrideWithValue(
          (_) => SelectedFile(),
        ),
        attachmentExporterFactoryProvider.overrideWithValue((_) => NoExport()),
        ownerDocumentsFactoryProvider.overrideWithValue((_) => documents),
        ownerCommandsFactoryProvider.overrideWithValue((_) => commands),
      ],
    );
    final repo = container.read(attachmentsRepositoryProvider);
    await container
        .read(privateSessionCleanupProvider)
        .prepareSignOut(owner)
        .timeout(const Duration(seconds: 2));
    storage.pendingDispose!.complete();
    await expectLater(
      repo.reserve(
        CommandId('late'),
        AttachmentReservationInput(
          target: target,
          filename: 'receipt.pdf',
          contentType: AttachmentContentType.pdf,
          sizeBytes: 3,
        ),
      ),
      throwsA(anything),
    );
  });
  test('an uncertain file survives closing and reopening its panel within one owner session', () async {
    final commands = FileCommands(owner)..pending = Completer();
    final repo = FirebaseAttachmentsRepository(
      FileDocuments(owner),
      commands,
      FileStorage(owner),
    );
    final container = ProviderContainer.test(
      overrides: [
        ownerUidProvider.overrideWithValue(owner),
        attachmentsRepositoryProvider.overrideWithValue(repo),
        attachmentPickerProvider.overrideWithValue(SelectedFile()),
        attachmentExporterProvider.overrideWithValue(NoExport()),
      ],
    );
    final subscription = container.listen(attachmentActionsProvider, (_, _) {});
    final first = container
        .read(attachmentActionsProvider.notifier)
        .select(target);
    await Future<void>.delayed(Duration.zero);
    commands.pending!.completeError(
      StateError('Synthetic uncertain reservation'),
    );
    await first;
    subscription.close();
    await container.pump();
    final reopened = container.listen(attachmentActionsProvider, (_, _) {});
    addTearDown(reopened.close);
    expect(container.read(attachmentActionsProvider).canRetry, isTrue);
    commands.pending = null;
    await container.read(attachmentActionsProvider.notifier).retry();
    expect(commands.calls[0].$2, commands.calls[1].$2);
  });
}
