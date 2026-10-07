import 'package:file_selector/file_selector.dart';
import 'package:web/web.dart' as web;

void releasePickedFile(XFile file) {
  if (file.path.startsWith('blob:')) web.URL.revokeObjectURL(file.path);
}
