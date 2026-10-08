import 'dart:convert';

import 'package:crypto/crypto.dart';

import '../../../core/identifiers/entity_ids.dart';

String outboxDatabaseName(OwnerUid owner, String environmentKey) {
  final match = RegExp(r'^[A-Za-z0-9_-]{1,160}$').firstMatch(environmentKey);
  if (match == null || match.end != environmentKey.length) {
    throw ArgumentError('Choose a valid environment and project scope.');
  }
  return 'tally_outbox_${sha256.convert(utf8.encode(jsonEncode([environmentKey, owner.value])))}';
}
