import '../../../core/identifiers/entity_ids.dart';

enum DeletionHandoffPhase { uncertain, accepted, cleanupRequired }

/// A local acceptance handoff contains no identity credentials or financial data.
final class DeletionHandoff {
  DeletionHandoff({
    required this.owner,
    required this.environment,
    required this.requestId,
    required this.phase,
  }) {
    final match = RegExp(r'^[A-Za-z0-9_-]{1,160}$').firstMatch(environment);
    if (match == null || match.end != environment.length) {
      throw const OwnerLocalCleanupFailure(
        'The saved deletion needs recovery.',
      );
    }
  }
  final OwnerUid owner;
  final String environment;
  final CommandId requestId;
  final DeletionHandoffPhase phase;
  bool get accepted => phase != DeletionHandoffPhase.uncertain;

  Map<String, Object?> toMap() => {
    'schemaVersion': 1,
    'userId': owner.value,
    'environment': environment,
    'requestId': requestId.value,
    'phase': phase.name,
  };

  factory DeletionHandoff.fromMap(
    Map<String, Object?> value, {
    required OwnerUid owner,
    required String environment,
  }) {
    const fields = {
      'schemaVersion',
      'userId',
      'environment',
      'requestId',
      'phase',
    };
    if (value.length != fields.length ||
        !fields.every(value.containsKey) ||
        value['schemaVersion'] is! int ||
        value['schemaVersion'] != 1 ||
        value['userId'] != owner.value ||
        value['environment'] != environment ||
        value['requestId'] is! String ||
        value['phase'] is! String) {
      throw const OwnerLocalCleanupFailure(
        'The saved deletion needs recovery.',
      );
    }
    try {
      return DeletionHandoff(
        owner: owner,
        environment: environment,
        requestId: CommandId(value['requestId']! as String),
        phase: DeletionHandoffPhase.values.byName(value['phase']! as String),
      );
    } catch (_) {
      throw const OwnerLocalCleanupFailure(
        'The saved deletion needs recovery.',
      );
    }
  }
}

final class OwnerLocalCleanupFailure implements Exception {
  const OwnerLocalCleanupFailure(this.message);
  final String message;
  @override
  String toString() => message;
}

abstract interface class DeletionHandoffStore {
  Future<DeletionHandoff?> read(OwnerUid owner, String environment);
  Future<void> write(DeletionHandoff value);
  Future<void> remove(DeletionHandoff expected);
  Future<List<DeletionHandoff>> readEnvironment(String environment);
}
