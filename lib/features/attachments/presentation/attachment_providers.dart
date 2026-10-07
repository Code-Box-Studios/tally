import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/data_page.dart';
import '../../../shared/presentation/financial_providers.dart';
import '../../../shared/presentation/private_session_cleanup_provider.dart';
import '../../auth/presentation/auth_providers.dart';
import '../data/attachment_export.dart';
import '../data/file_picker_adapter.dart';
import '../data/firebase_attachment_storage.dart';
import '../data/firebase_attachments_repository.dart';
import '../domain/attachment.dart';
import '../domain/attachment_capabilities.dart';
import '../domain/attachments_repository.dart';

final attachmentStorageFactoryProvider =
    Provider<AttachmentStorageGateway Function(OwnerUid)>((ref) {
      final clients = ref.watch(firebaseClientsProvider);
      final commands = ref.watch(ownerCommandGatewayProvider);
      return (owner) =>
          FirebaseAttachmentStorage(commands, clients.auth, owner);
    }, dependencies: [ownerCommandGatewayProvider]);
final attachmentPickerFactoryProvider =
    Provider<AttachmentPicker Function(OwnerUid)>((ref) {
      final auth = ref.watch(firebaseClientsProvider).auth;
      return (owner) => AttachmentFilePicker(
        owner: owner,
        currentOwner: () =>
            auth.currentUser == null ? null : OwnerUid(auth.currentUser!.uid),
      );
    });
final attachmentExporterFactoryProvider =
    Provider<AttachmentExporter Function(OwnerUid)>((ref) {
      final auth = ref.watch(firebaseClientsProvider).auth;
      return (owner) => attachmentExporter(
        owner,
        () => auth.currentUser == null ? null : OwnerUid(auth.currentUser!.uid),
      );
    });
Future<void> _close(Future<void> Function() close) async {
  try {
    await close().timeout(const Duration(seconds: 1));
  } catch (_) {
    /* The capability already fences late owner results. */
  }
}

final attachmentsRepositoryProvider =
    Provider.autoDispose<AttachmentsRepository>(
      (ref) {
        final owner = ref.watch(ownerUidProvider),
            storage = ref.watch(attachmentStorageFactoryProvider)(owner);
        final repo = FirebaseAttachmentsRepository(
          ref.watch(ownerDocumentGatewayProvider),
          ref.watch(ownerCommandGatewayProvider),
          storage,
        );
        final remove = ref
            .read(privateSessionCleanupProvider)
            .register(owner, repo.dispose);
        ref.onDispose(() {
          remove();
          unawaited(repo.dispose());
        });
        return repo;
      },
      dependencies: [
        ownerUidProvider,
        attachmentStorageFactoryProvider,
        ownerDocumentGatewayProvider,
        ownerCommandGatewayProvider,
        privateSessionCleanupProvider,
      ],
    );
final attachmentPickerProvider = Provider.autoDispose<AttachmentPicker>(
  (ref) {
    final owner = ref.watch(ownerUidProvider),
        picker = ref.watch(attachmentPickerFactoryProvider)(owner);
    final remove = ref
        .read(privateSessionCleanupProvider)
        .register(owner, () => _close(picker.dispose));
    ref.onDispose(() {
      remove();
      unawaited(_close(picker.dispose));
    });
    return picker;
  },
  dependencies: [
    ownerUidProvider,
    attachmentPickerFactoryProvider,
    privateSessionCleanupProvider,
  ],
);
final attachmentExporterProvider = Provider.autoDispose<AttachmentExporter>(
  (ref) {
    final owner = ref.watch(ownerUidProvider),
        exporter = ref.watch(attachmentExporterFactoryProvider)(owner);
    final remove = ref
        .read(privateSessionCleanupProvider)
        .register(owner, () => _close(exporter.dispose));
    ref.onDispose(() {
      remove();
      unawaited(_close(exporter.dispose));
    });
    return exporter;
  },
  dependencies: [
    ownerUidProvider,
    attachmentExporterFactoryProvider,
    privateSessionCleanupProvider,
  ],
);
final targetAttachmentsProvider = StreamProvider.autoDispose
    .family<DataPage<Attachment>, AttachmentTarget>(
      (ref, target) =>
          ref.watch(attachmentsRepositoryProvider).watchTarget(target),
      dependencies: [attachmentsRepositoryProvider],
    );
