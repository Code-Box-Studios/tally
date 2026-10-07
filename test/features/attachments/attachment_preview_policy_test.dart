import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:tally/features/attachments/domain/attachment.dart';
import 'package:tally/features/attachments/domain/attachment_preview_policy.dart';

Uint8List pngHeader(int width, int height, {bool animated = false}) {
  final out = BytesBuilder()..add([137, 80, 78, 71, 13, 10, 26, 10]);
  void chunk(String type, List<int> bytes) {
    out.add((ByteData(4)..setUint32(0, bytes.length)).buffer.asUint8List());
    out.add(type.codeUnits);
    out.add(bytes);
    out.add([0, 0, 0, 0]);
  }

  final header = ByteData(13)
    ..setUint32(0, width)
    ..setUint32(4, height)
    ..setUint8(8, 8);
  chunk('IHDR', header.buffer.asUint8List());
  if (animated) chunk('acTL', [0, 0, 0, 2, 0, 0, 0, 0]);
  chunk('IDAT', [1]);
  chunk('IEND', []);
  return out.takeBytes();
}

Uint8List jpegHeader(int width, int height) => Uint8List.fromList([
  255,
  216,
  255,
  192,
  0,
  11,
  8,
  height >> 8,
  height & 255,
  width >> 8,
  width & 255,
  1,
  1,
  17,
  0,
  255,
  218,
  0,
  8,
  1,
  1,
  0,
  0,
  63,
  0,
  255,
  217,
]);
Uint8List webpHeader(
  int width,
  int height, {
  bool extended = false,
  bool animated = false,
  int? canvasWidth,
}) {
  final chunks = BytesBuilder();
  void chunk(String type, List<int> data) {
    chunks.add(type.codeUnits);
    chunks.add(
      (ByteData(
        4,
      )..setUint32(0, data.length, Endian.little)).buffer.asUint8List(),
    );
    chunks.add(data);
    if (data.length.isOdd) chunks.add([0]);
  }

  if (extended) {
    final w = (canvasWidth ?? width) - 1, h = height - 1;
    chunk('VP8X', [
      animated ? 2 : 0,
      0,
      0,
      0,
      w & 255,
      (w >> 8) & 255,
      w >> 16,
      h & 255,
      (h >> 8) & 255,
      h >> 16,
    ]);
  }
  final bits = (width - 1) | ((height - 1) << 14);
  chunk('VP8L', [
    47,
    bits & 255,
    (bits >> 8) & 255,
    (bits >> 16) & 255,
    (bits >> 24) & 255,
  ]);
  final body = chunks.takeBytes();
  return (BytesBuilder()
        ..add('RIFF'.codeUnits)
        ..add(
          (ByteData(
            4,
          )..setUint32(0, body.length + 4, Endian.little)).buffer.asUint8List(),
        )
        ..add('WEBP'.codeUnits)
        ..add(body))
      .takeBytes();
}

void main() {
  bool allowed(Uint8List bytes, AttachmentContentType type) =>
      AttachmentPreviewPolicy.canPreview(
        AttachmentFileInput(filename: 'image', contentType: type, bytes: bytes),
      );
  test(
    'preview refuses dangerous dimensions before any decoder receives bytes',
    () {
      for (final bytes in [
        pngHeader(12000, 9000),
        pngHeader(0, 10),
        pngHeader(2147483647, 2147483647),
        pngHeader(2049, 2048),
      ]) {
        expect(allowed(bytes, AttachmentContentType.png), isFalse);
      }
      expect(allowed(pngHeader(2048, 2048), AttachmentContentType.png), isTrue);
      expect(
        allowed(jpegHeader(12000, 9000), AttachmentContentType.jpeg),
        isFalse,
      );
      expect(
        allowed(jpegHeader(1600, 1200), AttachmentContentType.jpeg),
        isTrue,
      );
      expect(
        allowed(webpHeader(12000, 9000), AttachmentContentType.webp),
        isFalse,
      );
      expect(
        allowed(webpHeader(1600, 1200), AttachmentContentType.webp),
        isTrue,
      );
      expect(
        allowed(
          webpHeader(1600, 1200, extended: true),
          AttachmentContentType.webp,
        ),
        isTrue,
      );
    },
  );
  test('lossy WebP dimensions are checked before decoding', () {
    final bytes = Uint8List.fromList([
      ...'RIFF'.codeUnits,
      22,
      0,
      0,
      0,
      ...'WEBPVP8 '.codeUnits,
      10,
      0,
      0,
      0,
      0,
      0,
      0,
      157,
      1,
      42,
      64,
      6,
      176,
      4,
    ]);
    expect(allowed(bytes, AttachmentContentType.webp), isTrue);
    bytes[26] = 224;
    bytes[27] = 46;
    bytes[28] = 40;
    bytes[29] = 35;
    expect(allowed(bytes, AttachmentContentType.webp), isFalse);
  });
  test('truncated headers fail closed without reading outside the file', () {
    for (final pair in [
      (pngHeader(10, 10), AttachmentContentType.png),
      (jpegHeader(10, 10), AttachmentContentType.jpeg),
      (webpHeader(10, 10, extended: true), AttachmentContentType.webp),
    ]) {
      final limit = pair.$2 == AttachmentContentType.jpeg ? 24 : pair.$1.length;
      for (var length = 1; length < limit; length++) {
        expect(allowed(pair.$1.sublist(0, length), pair.$2), isFalse);
      }
    }
  });
  test('animation, contradictory canvas and malformed headers never reach the preview decoder', () {
    expect(
      allowed(pngHeader(10, 10, animated: true), AttachmentContentType.png),
      isFalse,
    );
    expect(
      allowed(
        webpHeader(10, 10, extended: true, animated: true),
        AttachmentContentType.webp,
      ),
      isFalse,
    );
    expect(
      allowed(
        webpHeader(12000, 9000, extended: true, canvasWidth: 10),
        AttachmentContentType.webp,
      ),
      isFalse,
    );
    expect(allowed(pngHeader(10, 10), AttachmentContentType.jpeg), isFalse);
    for (final type in AttachmentContentType.values) {
      for (final bytes in [
        Uint8List.fromList([1]),
        Uint8List.fromList([255, 216, 255, 192, 255, 255]),
        pngHeader(10, 10).sublist(0, 28),
        webpHeader(10, 10).sublist(0, 24),
      ]) {
        expect(allowed(bytes, type), isFalse);
      }
    }
  });
}
