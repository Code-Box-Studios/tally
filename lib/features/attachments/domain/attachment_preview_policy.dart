import 'dart:typed_data';

import 'attachment.dart';

/// Inspects bounded headers before handing private bytes to an image decoder.
/// Export keeps the original file even when a preview is unsafe or unsupported.
abstract final class AttachmentPreviewPolicy {
  static const maxPixels = 4194304;
  static const maxDecodedEdge = 1024;

  static bool canPreview(AttachmentFileInput file) =>
      switch (file.contentType) {
        AttachmentContentType.png => _png(file.bytes),
        AttachmentContentType.jpeg => _jpeg(file.bytes),
        AttachmentContentType.webp => _webp(file.bytes),
        AttachmentContentType.pdf => false,
      };

  // Division avoids multiplying hostile dimensions beyond JavaScript's exact
  // integer range. The cap also bounds platforms that ignore decode hints.
  static bool _safe(int width, int height) =>
      width > 0 && height > 0 && width <= maxPixels ~/ height;

  static bool _matches(Uint8List bytes, int offset, List<int> value) {
    if (offset < 0 || offset + value.length > bytes.length) return false;
    for (var i = 0; i < value.length; i++) {
      if (bytes[offset + i] != value[i]) return false;
    }
    return true;
  }

  static bool _png(Uint8List bytes) {
    if (!_matches(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10])) return false;
    final data = ByteData.sublistView(bytes);
    var offset = 8, chunks = 0;
    var header = false, pixels = false;
    while (offset + 12 <= bytes.length && chunks++ < 512) {
      final length = data.getUint32(offset);
      final end = offset + 12 + length;
      if (end > bytes.length) return false;
      final kind = String.fromCharCodes(bytes.sublist(offset + 4, offset + 8));
      if (!header && kind != 'IHDR') return false;
      if (kind == 'IHDR') {
        if (header ||
            length != 13 ||
            !_safe(data.getUint32(offset + 8), data.getUint32(offset + 12))) {
          return false;
        }
        header = true;
      } else if (kind == 'acTL' || kind == 'fcTL' || kind == 'fdAT') {
        return false;
      } else if (kind == 'IDAT') {
        pixels = true;
      } else if (kind == 'IEND') {
        return length == 0 && pixels && end == bytes.length;
      }
      offset = end;
    }
    return false;
  }

  static bool _jpeg(Uint8List bytes) {
    if (!_matches(bytes, 0, [255, 216])) return false;
    final data = ByteData.sublistView(bytes);
    var offset = 2, segments = 0;
    var frame = false;
    const frames = {
      192,
      193,
      194,
      195,
      197,
      198,
      199,
      201,
      202,
      203,
      205,
      206,
      207,
    };
    while (offset + 4 <= bytes.length && segments++ < 1024) {
      if (bytes[offset++] != 255) return false;
      var padding = 0;
      while (offset < bytes.length && bytes[offset] == 255 && padding++ < 64) {
        offset++;
      }
      if (offset + 3 > bytes.length) return false;
      final marker = bytes[offset++];
      if (marker == 0 ||
          marker == 216 ||
          marker == 217 ||
          marker == 1 ||
          marker >= 208 && marker <= 215) {
        return false;
      }
      final length = data.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) return false;
      if (frames.contains(marker)) {
        if (frame ||
            length < 8 ||
            !_safe(data.getUint16(offset + 5), data.getUint16(offset + 3))) {
          return false;
        }
        frame = true;
      }
      if (marker == 218) return frame;
      offset += length;
    }
    return false;
  }

  static bool _webp(Uint8List bytes) {
    if (bytes.length < 20 ||
        !_matches(bytes, 0, 'RIFF'.codeUnits) ||
        !_matches(bytes, 8, 'WEBP'.codeUnits)) {
      return false;
    }
    final data = ByteData.sublistView(bytes);
    if (data.getUint32(4, Endian.little) + 8 != bytes.length) return false;
    var offset = 12, chunks = 0;
    (int, int)? canvas, frame;
    while (offset + 8 <= bytes.length && chunks++ < 256) {
      final kind = String.fromCharCodes(bytes.sublist(offset, offset + 4));
      final length = data.getUint32(offset + 4, Endian.little);
      final start = offset + 8, end = offset + 8 + length;
      if (end + (length & 1) > bytes.length) return false;
      if (kind == 'VP8X') {
        if (canvas != null ||
            frame != null ||
            offset != 12 ||
            length != 10 ||
            bytes[start] & 2 != 0) {
          return false;
        }
        canvas = (_uint24(bytes, start + 4) + 1, _uint24(bytes, start + 7) + 1);
        if (!_safe(canvas.$1, canvas.$2)) return false;
      } else if (kind == 'VP8L') {
        if (frame != null || length < 5 || bytes[start] != 47) return false;
        final bits = data.getUint32(start + 1, Endian.little);
        if (bits >> 29 != 0) return false;
        frame = ((bits & 16383) + 1, ((bits >> 14) & 16383) + 1);
      } else if (kind == 'VP8 ') {
        if (frame != null ||
            length < 10 ||
            bytes[start] & 1 != 0 ||
            !_matches(bytes, start + 3, [157, 1, 42])) {
          return false;
        }
        frame = (
          data.getUint16(start + 6, Endian.little) & 16383,
          data.getUint16(start + 8, Endian.little) & 16383,
        );
      } else if (kind == 'ANIM' || kind == 'ANMF') {
        return false;
      }
      if (frame != null && !_safe(frame.$1, frame.$2)) return false;
      offset = end + (length & 1);
    }
    return offset == bytes.length &&
        frame != null &&
        (canvas == null || canvas == frame);
  }

  static int _uint24(Uint8List bytes, int offset) =>
      bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16;
}
