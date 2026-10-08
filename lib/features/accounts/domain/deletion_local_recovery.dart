import '../../../core/identifiers/entity_ids.dart';
import 'deletion_handoff_store.dart';
import 'owner_local_cleanup.dart';

final class DeletionRecoveryReport {
  DeletionRecoveryReport({
    Iterable<DeletionHandoff> pending = const [],
    Iterable<OwnerUid> cleanupFailures = const {},
    this.needsRecovery = false,
  }) : pending = List.unmodifiable(pending),
       cleanupFailures = Set.unmodifiable(cleanupFailures);
  final List<DeletionHandoff> pending;
  final Set<OwnerUid> cleanupFailures;
  final bool needsRecovery;
}

/// Local recovery has no authentication or server-deletion authority.
final class DeletionLocalRecovery {
  DeletionLocalRecovery({
    required this.handoffs,
    required this.cleanup,
    required this.environment,
  });
  final DeletionHandoffStore handoffs;
  final OwnerLocalCleanup cleanup;
  final String environment;
  Future<DeletionRecoveryReport> recover({OwnerUid? retryOwner}) async {
    final failures = <OwnerUid>{};
    var pending = <DeletionHandoff>[];
    try {
      pending = await handoffs.readEnvironment(environment);
      if (pending.any((record) => record.environment != environment)) {
        return DeletionRecoveryReport(needsRecovery: true);
      }
      for (final record in pending) {
        if (!record.accepted ||
            retryOwner != null && record.owner != retryOwner) {
          continue;
        }
        try {
          await cleanup.quiesceAndPurge(record.owner, environment);
        } catch (_) {
          // Server acceptance remains valid. No raw plugin, path, credential or
          // financial exception is retained in root presentation state.
          failures.add(record.owner);
        }
      }
      pending = await handoffs.readEnvironment(environment);
      if (pending.any((record) => record.environment != environment)) {
        return DeletionRecoveryReport(
          cleanupFailures: failures,
          needsRecovery: true,
        );
      }
      return DeletionRecoveryReport(
        pending: pending,
        cleanupFailures: failures,
      );
    } catch (_) {
      return DeletionRecoveryReport(
        pending: pending,
        cleanupFailures: failures,
        needsRecovery: true,
      );
    }
  }
}
