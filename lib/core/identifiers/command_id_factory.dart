import 'dart:math';

import 'entity_ids.dart';

CommandId newCommandId() {
  final random = Random.secure();
  final suffix = List.generate(
    16,
    (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
  ).join();
  return CommandId('cmd_$suffix');
}
