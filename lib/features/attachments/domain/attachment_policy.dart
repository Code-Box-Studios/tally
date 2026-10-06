enum AttachmentContentType {
  jpeg('image/jpeg', 'jpg'),
  png('image/png', 'png'),
  webp('image/webp', 'webp'),
  pdf('application/pdf', 'pdf');

  const AttachmentContentType(this.mime, this.extension);
  final String mime, extension;
  static AttachmentContentType parse(String value) {
    for (final type in values) {
      if (type.mime == value) return type;
    }
    throw ArgumentError('Choose a JPEG, PNG, WebP or PDF file.');
  }
}

abstract final class AttachmentPolicy {
  static const maxBytes = 10485760;
  static const maxActivePerTarget = 10;
  static void validateSize(int value) {
    if (value < 1 || value > maxBytes) {
      throw ArgumentError('Choose a file between one byte and 10 MiB.');
    }
  }

  static void validateFilename(String value) {
    if (value.isEmpty ||
        value.length > 150 ||
        value.trim() != value ||
        value == '.' ||
        value == '..' ||
        RegExp(
          r'[/\\\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u206f]',
        ).hasMatch(value)) {
      throw ArgumentError('Choose a file with a short, safe filename.');
    }
  }

  static void validateSha256(String? value) {
    if (value != null && !RegExp(r'^[a-f0-9]{64}$').hasMatch(value)) {
      throw ArgumentError('Invalid file checksum.');
    }
  }

  static void validateGeneration(String value) {
    if (!RegExp(r'^[1-9][0-9]{0,19}$').hasMatch(value)) {
      throw ArgumentError('Invalid file generation.');
    }
  }
}
