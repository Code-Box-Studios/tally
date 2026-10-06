import 'attachment.dart';

abstract interface class AttachmentPicker {
  Future<AttachmentFileInput?> select();
  Future<void> dispose();
}

abstract interface class AttachmentExporter {
  Future<void> export(AttachmentBytes bytes);
  Future<void> dispose();
}
