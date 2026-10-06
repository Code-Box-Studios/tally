import '../../../core/identifiers/entity_ids.dart';
import '../domain/attachment_capabilities.dart';
import 'attachment_export_native.dart'
    if (dart.library.js_interop) 'attachment_export_web.dart'
    as platform;

AttachmentExporter attachmentExporter(
  OwnerUid owner,
  OwnerUid? Function() currentOwner,
) => platform.createAttachmentExporter(owner, currentOwner);
