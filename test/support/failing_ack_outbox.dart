import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/sync/data/local_outbox_failure.dart';
import 'package:tally/features/sync/domain/frozen_command.dart';
import 'package:tally/features/sync/domain/outbox_entry.dart';
import 'package:tally/features/sync/domain/outbox_store.dart';
import 'package:tally/features/sync/domain/sync_capability.dart';
import 'package:tally/shared/domain/data_page.dart';
import 'package:tally/shared/domain/financial_failure.dart';

/// Injects disk exhaustion only after the real store has committed its intent.
final class FailingAckOutbox implements OutboxStore {
  FailingAckOutbox(this.base);
  final OutboxStore base;
  bool failAcknowledgements = true;
  void _acknowledge() {
    if (failAcknowledgements) {
      throw const LocalOutboxFailure(SyncAvailability.quota);
    }
  }

  @override
  OwnerUid get owner => base.owner;
  @override
  Future<OutboxEntry> enqueue(FrozenCommand command) => base.enqueue(command);
  @override
  Future<OutboxEntry?> get(CommandId id) => base.get(id);
  @override
  Stream<DataPage<OutboxEntry>> watch({
    int limit = 100,
    bool unresolvedOnly = false,
  }) => base.watch(limit: limit, unresolvedOnly: unresolvedOnly);
  @override
  Future<DataPage<OutboxEntry>> getPage({
    PageCursor? after,
    int limit = 100,
    bool unresolvedOnly = false,
  }) =>
      base.getPage(after: after, limit: limit, unresolvedOnly: unresolvedOnly);
  @override
  Future<DispatchLease?> claimDispatch(DateTime now, {required String token}) =>
      base.claimDispatch(now, token: token);
  @override
  Future<LeasedCommand?> claimNext(DispatchLease dispatch, DateTime now) =>
      base.claimNext(dispatch, now);
  @override
  Future<bool> complete(
    LeasedCommand lease,
    Map<String, Object?> result,
    DateTime now,
  ) async {
    _acknowledge();
    return base.complete(lease, result, now);
  }

  @override
  Future<bool> defer(
    LeasedCommand lease,
    FinancialFailure failure,
    DateTime nextAttemptAt,
    DateTime now,
  ) async {
    _acknowledge();
    return base.defer(lease, failure, nextAttemptAt, now);
  }

  @override
  Future<bool> reject(
    LeasedCommand lease,
    FinancialFailure failure,
    DateTime now,
  ) => base.reject(lease, failure, now);
  @override
  Future<void> releaseDispatch(DispatchLease lease) async {
    _acknowledge();
    await base.releaseDispatch(lease);
  }

  @override
  Future<bool> cancelUnsent(CommandId id, DateTime now) =>
      base.cancelUnsent(id, now);
  @override
  Future<List<OutboxEntry>> findCreations(Set<String> resourceKeys) =>
      base.findCreations(resourceKeys);
  @override
  Future<bool> dismissRejected(CommandId id, DateTime now) =>
      base.dismissRejected(id, now);
  @override
  Future<void> retry(CommandId id, DateTime now) => base.retry(id, now);
  @override
  Future<void> close() => base.close();
}
