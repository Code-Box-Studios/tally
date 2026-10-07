import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/data_page.dart';
import '../../../shared/domain/financial_failure.dart';
import 'frozen_command.dart';
import 'outbox_entry.dart';

/// Owns one UID/environment database. Every transition is a local transaction.
abstract interface class OutboxStore {
  OwnerUid get owner;

  /// Same identity returns its existing row; a changed intent conflicts. Refuse
  /// missing/foreign/cyclic dependencies and more than 1,000 unresolved rows.
  Future<OutboxEntry> enqueue(FrozenCommand command);
  Future<OutboxEntry?> get(CommandId id);
  Stream<DataPage<OutboxEntry>> watch({int limit = 100});
  Future<DataPage<OutboxEntry>> getPage({PageCursor? after, int limit = 100});

  /// One 60-second owner lease coordinates workers. Clock-jump recovery must
  /// invalidate the former generation before reclaiming a sending row.
  Future<DispatchLease?> claimDispatch(DateTime now, {required String token});
  Future<LeasedCommand?> claimNext(DispatchLease dispatch, DateTime now);

  /// Return false when a lease expired or another generation now owns the row.
  Future<bool> complete(
    LeasedCommand lease,
    Map<String, Object?> result,
    DateTime now,
  );
  Future<bool> defer(
    LeasedCommand lease,
    FinancialFailure failure,
    DateTime nextAttemptAt,
    DateTime now,
  );
  Future<bool> reject(
    LeasedCommand lease,
    FinancialFailure failure,
    DateTime now,
  );
  Future<void> releaseDispatch(DispatchLease lease);

  /// Only never-dispatched rows can be cancelled. Retain a local tombstone and
  /// block dependents; an uncertain server action must first be reconciled.
  Future<bool> cancelUnsent(CommandId id, DateTime now);
  Future<void> retry(CommandId id, DateTime now);
  Future<void> close();
}
