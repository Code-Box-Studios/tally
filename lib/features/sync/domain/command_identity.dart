import 'dart:convert';

import 'package:crypto/crypto.dart';

import '../../../core/identifiers/entity_ids.dart';

/// Predicts a server creation reference without adding authority to its payload.
String predictedCommandId(OwnerUid owner, CommandId command, String role) {
  const roles = {'obligation', 'instance', 'contact', 'source', 'category'};
  if (!roles.contains(role)) throw ArgumentError('Unsupported creation role.');
  final input = jsonEncode(['${owner.value}:${command.value}', role]);
  return '$role-${sha256.convert(utf8.encode(input))}';
}
