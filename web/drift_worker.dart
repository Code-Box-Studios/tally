import 'package:drift/wasm.dart';

// Rebuild only against the pinned Drift release recorded in the asset manifest.
void main() => WasmDatabase.workerMainForOpen();
