import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/identifiers/command_id_factory.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/data/financial_failure_mapper.dart';
import '../../../shared/domain/financial_failure.dart';
import '../../../shared/presentation/financial_providers.dart';
import '../../auth/presentation/auth_providers.dart';
import '../data/local_outbox_failure.dart';
import '../domain/command_submission.dart';
import '../domain/frozen_command.dart';
import '../domain/outbox_entry.dart';
import '../domain/sync_capability.dart';
import 'sync_providers.dart';

final pendingActionsControllerProvider =
    AsyncNotifierProvider<PendingActionsController, void>(
      PendingActionsController.new,
      dependencies: [
        ownerUidProvider,
        outboxStoreProvider,
        syncEngineProvider,
        ownerCommandGatewayProvider,
      ],
    );

final class PendingActionsController extends AsyncNotifier<void> {
  final _reviews = <String, CommandId>{};
  @override
  void build() {
    ref.watch(ownerUidProvider);
  }

  Future<void> _work(Future<void> Function() operation) async {
    if (state.isLoading) return;
    state = const AsyncLoading();
    try {
      await operation();
      if (ref.mounted) state = const AsyncData(null);
    } catch (error, stack) {
      if (ref.mounted) {
        state = AsyncError(
          error is LocalOutboxFailure ? error : financialFailure(error),
          stack,
        );
      }
    }
  }

  Future<void> retry(CommandId id) => _work(() async {
    final engine = ref.read(syncEngineProvider);
    if (engine == null) {
      throw const LocalOutboxFailure(SyncAvailability.unavailable);
    }
    await engine.retry(id);
    if (ref.mounted) ref.invalidate(outboxCommandProvider(id));
  });
  Future<void> cancel(CommandId id) => _work(() async {
    final store = ref.read(outboxStoreProvider);
    if (store == null) {
      throw const LocalOutboxFailure(SyncAvailability.unavailable);
    }
    if (!await store.cancelUnsent(id, DateTime.now().toUtc())) {
      throw const FinancialFailure(
        FinancialFailureCode.recovery,
        'This action was already attempted. Verify its original result before changing it.',
      );
    }
    if (ref.mounted) ref.invalidate(outboxCommandProvider(id));
  });
  Future<CommandSubmission<Map<String, Object?>>?> review(
    CommandId originalId,
    Map<String, Object?> payload,
  ) async {
    if (state.isLoading) return null;
    state = const AsyncLoading();
    String? key;
    try {
      final owner = ref.read(ownerUidProvider),
          store = ref.read(outboxStoreProvider);
      if (store == null) {
        throw const LocalOutboxFailure(SyncAvailability.unavailable);
      }
      final original = await store.get(originalId);
      if (!ref.mounted) return null;
      if (original == null ||
          original.command.owner != owner ||
          original.state != OutboxState.rejected) {
        throw const FinancialFailure(
          FinancialFailureCode.recovery,
          'Only a rejected action can become a reviewed new save. Retry an uncertain action using its original identity.',
        );
      }
      final reviewed = freezeCommandJson(payload);
      key = jsonEncode([
        originalId.value,
        original.command.name.name,
        reviewed,
      ]);
      final id = _reviews.putIfAbsent(key, newCommandId);
      final result = await ref
          .read(ownerCommandGatewayProvider)
          .call(original.command.name.name, id, reviewed);
      if (!ref.mounted) return null;
      _reviews.remove(key);
      state = const AsyncData(null);
      return AcceptedSubmission(result);
    } on QueuedCommand catch (queued) {
      if (!ref.mounted || queued.owner != ref.read(ownerUidProvider)) {
        return null;
      }
      state = const AsyncData(null);
      return QueuedSubmission(queued.owner, queued.commandId);
    } catch (error, stack) {
      if (!ref.mounted) return null;
      final failure = error is LocalOutboxFailure
          ? error
          : financialFailure(error);
      if (key != null &&
          failure is FinancialFailure &&
          const {
            FinancialFailureCode.conflict,
            FinancialFailureCode.invalid,
            FinancialFailureCode.overpayment,
            FinancialFailureCode.recovery,
          }.contains(failure.code)) {
        _reviews.remove(key);
      }
      state = AsyncError(failure, stack);
      return null;
    }
  }
}
