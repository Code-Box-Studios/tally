import 'dart:convert';

import 'package:crypto/crypto.dart';

import '../../../core/identifiers/entity_ids.dart';
import 'command_name.dart';

const maxCommandBytes = 65536;
const maxCommandDependencies = 16;
const maxCommandDepth = 16;
const maxExactCommandInteger = 9007199254740991;

final class CommandDependency {
  const CommandDependency(this.owner, this.id);
  final OwnerUid owner;
  final CommandId id;
}

/// A deeply immutable action whose financial payload never changes on retry.
final class FrozenCommand {
  factory FrozenCommand({
    required OwnerUid owner,
    required CommandId id,
    required CommandName name,
    required Map<String, Object?> payload,
    required String resourceKey,
    required DateTime createdAt,
    List<CommandDependency> dependencies = const [],
  }) {
    final resource = RegExp(
      r'^(obligation|contact|source|category|notifications):[A-Za-z0-9_-]{1,128}$',
    ).firstMatch(resourceKey);
    if (!createdAt.isUtc ||
        resource == null ||
        resource.end != resourceKey.length ||
        dependencies.length > maxCommandDependencies) {
      throw ArgumentError('Invalid saved action identity.');
    }
    final checked = List<CommandDependency>.of(dependencies);
    if (checked.any(
          (dependency) => dependency.owner != owner || dependency.id == id,
        ) ||
        checked.map((dependency) => dependency.id).toSet().length !=
            checked.length) {
      throw ArgumentError('Invalid saved action dependency.');
    }
    checked.sort((a, b) => a.id.value.compareTo(b.id.value));
    final frozen = freezeCommandJson(payload), encoded = jsonEncode(frozen);
    return FrozenCommand._(
      owner,
      id,
      name,
      frozen,
      encoded,
      sha256.convert(utf8.encode(encoded)).toString(),
      resourceKey,
      List.unmodifiable(checked),
      createdAt,
    );
  }

  const FrozenCommand._(
    this.owner,
    this.id,
    this.name,
    this.payload,
    this.payloadJson,
    this.payloadHash,
    this.resourceKey,
    this.dependencies,
    this.createdAt,
  );
  final OwnerUid owner;
  final CommandId id;
  final CommandName name;
  final Map<String, Object?> payload;
  final String payloadJson, payloadHash, resourceKey;
  final List<CommandDependency> dependencies;
  final DateTime createdAt;
  int get schemaVersion => 1;

  /// Retry identity excludes the local creation clock, preserving the first
  /// insertion time when the same intent is re-enqueued after an uncertain save.
  bool sameIdentity(FrozenCommand other) =>
      owner == other.owner &&
      id == other.id &&
      name == other.name &&
      payloadJson == other.payloadJson &&
      resourceKey == other.resourceKey &&
      dependencies.length == other.dependencies.length &&
      Iterable<int>.generate(dependencies.length)
          .every((i) => dependencies[i].id == other.dependencies[i].id);

  Map<String, Object?> toStored() => Map.unmodifiable({
    'schemaVersion': schemaVersion,
    'userId': owner.value,
    'commandId': id.value,
    'name': name.name,
    'payloadJson': payloadJson,
    'payloadHash': payloadHash,
    'resourceKey': resourceKey,
    'dependencies': List<String>.unmodifiable(
      dependencies.map((d) => d.id.value),
    ),
    'createdAt': createdAt.toIso8601String(),
  });

  factory FrozenCommand.fromStored(
    Map<String, Object?> data, {
    required OwnerUid expectedOwner,
  }) {
    const keys = {
      'schemaVersion',
      'userId',
      'commandId',
      'name',
      'payloadJson',
      'payloadHash',
      'resourceKey',
      'dependencies',
      'createdAt',
    };
    try {
      if (data.length != keys.length ||
          !data.keys.every(keys.contains) ||
          data['schemaVersion'] is! int ||
          data['schemaVersion'] != 1 ||
          data['userId'] != expectedOwner.value ||
          data['payloadJson'] is! String ||
          (data['payloadJson'] as String).length > maxCommandBytes) {
        throw ArgumentError('Invalid saved action.');
      }
      final decoded = jsonDecode(data['payloadJson'] as String);
      if (decoded is! Map) throw ArgumentError('Invalid saved payload.');
      final dependencies = data['dependencies'];
      if (dependencies is! List ||
          dependencies.length > maxCommandDependencies) {
        throw ArgumentError('Invalid dependencies.');
      }
      final result = FrozenCommand(
        owner: expectedOwner,
        id: CommandId(data['commandId'] as String),
        name: CommandName.parse(data['name'] as String),
        payload: Map<String, Object?>.from(decoded),
        resourceKey: data['resourceKey'] as String,
        createdAt: DateTime.parse(data['createdAt'] as String),
        dependencies: dependencies
            .map(
              (value) =>
                  CommandDependency(expectedOwner, CommandId(value as String)),
            )
            .toList(),
      );
      if (data['payloadHash'] != result.payloadHash) {
        throw ArgumentError('Invalid saved payload identity.');
      }
      return result;
    } catch (_) {
      throw ArgumentError(
        'This saved action needs recovery. Its data was preserved.',
      );
    }
  }
}

/// Bounds the complete encoded JSON while copying it, before large allocations.
Map<String, Object?> freezeCommandJson(Map<String, Object?> value) =>
    _freeze(value, 0, _JsonBudget()) as Map<String, Object?>;

final class _JsonBudget {
  int used = 0;
  void add(int bytes) {
    used += bytes;
    if (used > maxCommandBytes) {
      throw ArgumentError('This action is too large to save locally.');
    }
  }

  void scalar(Object? value) {
    if (value is String && value.length > maxCommandBytes) {
      throw ArgumentError('This action is too large to save locally.');
    }
    add(utf8.encode(jsonEncode(value)).length);
  }
}

Object? _freeze(Object? value, int depth, _JsonBudget budget) {
  if (depth > maxCommandDepth) {
    throw ArgumentError('This saved action is too deeply nested.');
  }
  if (value == null || value is bool || value is String) {
    budget.scalar(value);
    return value;
  }
  if (value is num) {
    if (!value.isFinite ||
        value.abs() > maxExactCommandInteger ||
        value != value.truncateToDouble()) {
      throw ArgumentError('Saved action numbers must be exact safe integers.');
    }
    final integer = value.toInt();
    budget.scalar(integer);
    return integer;
  }
  if (value is List) {
    if (value.length > maxCommandBytes ~/ 2) {
      throw ArgumentError('This action has too many values.');
    }
    budget.add(2 + (value.isEmpty ? 0 : value.length - 1));
    return List<Object?>.unmodifiable(
      value.map((item) => _freeze(item, depth + 1, budget)),
    );
  }
  if (value is Map) {
    if (value.length > maxCommandBytes ~/ 5 ||
        value.keys.any((key) => key is! String)) {
      throw ArgumentError('Invalid saved action fields.');
    }
    final keys = value.keys.cast<String>().toList()..sort();
    final result = <String, Object?>{};
    budget.add(2 + (keys.isEmpty ? 0 : keys.length - 1));
    const privateKeys = {
      'password',
      'cvv',
      'pin',
      'secret',
      'token',
      'accesstoken',
      'refreshtoken',
      'authorization',
      'contentbase64',
      'bytes',
    };
    for (final key in keys) {
      if (privateKeys.contains(key.toLowerCase())) {
        throw ArgumentError(
          'Credentials and file bytes do not belong in a saved action.',
        );
      }
      budget.scalar(key);
      budget.add(1);
      result[key] = _freeze(value[key], depth + 1, budget);
    }
    return Map<String, Object?>.unmodifiable(result);
  }
  throw ArgumentError('Unsupported saved action value.');
}
