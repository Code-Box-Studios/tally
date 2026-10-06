import 'attachment.dart';

abstract interface class AttachmentPicker {
  Future<AttachmentFileInput?> select();
}

abstract interface class AttachmentExporter {
  Future<void> export(AttachmentBytes bytes);
  Future<void> dispose();
}
