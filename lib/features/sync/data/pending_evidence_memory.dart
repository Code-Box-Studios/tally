import '../../attachments/domain/attachment.dart';
import '../domain/pending_evidence.dart';
import 'pending_evidence_sqlite.dart';

/// Browser bytes are deliberately transient, bounded to one selected receipt.
final class MemoryPendingReceiptFiles implements PendingEvidenceFiles {
  String? _key;
  AttachmentFileInput? _file;
  @override
  bool get bytesSurviveRestart => false;
  @override
  Future<void> prepare(List<PendingEvidence> retained) async {
    if (!retained.any((value) => value.fileKey == _key)) {
      _key = null;
      _file = null;
    }
  }

  @override
  Future<void> put(PendingEvidence metadata, AttachmentFileInput file) async {
    _key = metadata.fileKey;
    _file = file;
  }

  @override
  Future<AttachmentFileInput> read(PendingEvidence metadata) async {
    if (_key != metadata.fileKey || _file == null) {
      throw const PendingEvidenceFailure(PendingEvidenceFailureCode.reselect);
    }
    return _file!;
  }

  @override
  Future<void> remove(PendingEvidence metadata) async {
    if (_key == metadata.fileKey) {
      _key = null;
      _file = null;
    }
  }

  @override
  Future<void> close() async {
    _key = null;
    _file = null;
  }
}
