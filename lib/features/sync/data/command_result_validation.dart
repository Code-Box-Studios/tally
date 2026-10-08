import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/data/document_reader.dart';
import '../domain/command_identity.dart';
import '../domain/command_name.dart';
import '../domain/command_transport.dart';
import '../domain/frozen_command.dart';

/// A receipt is locally accepted only after checking the protected endpoint's
/// response. Malformed acknowledgements remain uncertain, never rejected saves.
Map<String, Object?> validateCommandResult(
  FrozenCommand command,
  Map<String, Object?> result,
) {
  try {
    final frozen = freezeCommandJson(result);
    final reader = DocumentReader(frozen), payload = command.payload;
    String identifier(String key, [String? expected]) {
      final value = reader.text(key, max: 128, required: true);
      CommandId(value);
      if (expected != null && value != expected) throw const FormatException();
      return value;
    }

    String? nullableId(String key) {
      if (reader.value(key) == null) return null;
      return identifier(key);
    }

    void positive(String key) => reader.integer(key, min: 1);
    String obligation({bool created = false}) => identifier(
      'obligationId',
      created
          ? predictedCommandId(command.owner, command.id, 'obligation')
          : payload['obligationId'] as String? ??
                command.resourceKey.substring('obligation:'.length),
    );
    Set<String> allocations(String key, {int min = 1, int max = 48}) {
      final values = reader.objects(key, min: min, max: max);
      final ids = <String>{};
      for (final allocation in values) {
        final id = allocation.text('instanceId', max: 128, required: true);
        CommandId(id);
        allocation.integer('instanceRevision', min: 1);
        if (!ids.add(id)) throw const FormatException();
      }
      return ids;
    }

    void paymentPeriods({required bool installment}) {
      final period = nullableId('obligationInstanceId');
      final revision = reader.value('instanceRevision');
      if (period == null) {
        if (revision != null || !installment) throw const FormatException();
      } else {
        positive('instanceRevision');
        if (payload['obligationInstanceId'] != null &&
            period != payload['obligationInstanceId']) {
          throw const FormatException();
        }
      }
      Set<String>? periods;
      if (frozen.containsKey('allocationRevisions')) {
        periods = allocations(
          'allocationRevisions',
          min: period == null ? 2 : 1,
          max: installment ? 24 : 48,
        );
        if (period != null &&
            (periods.length != 1 || !periods.contains(period))) {
          throw const FormatException();
        }
      } else if (period == null) {
        throw const FormatException();
      }
      if (payload['explicitAllocations'] case final List<Object?> explicit) {
        final expected = {
          for (final item in explicit) (item as Map)['instanceId'],
        };
        final actual = periods ?? {period!};
        if (expected.length != actual.length || !actual.containsAll(expected)) {
          throw const FormatException();
        }
      }
    }

    switch (command.name) {
      case CommandName.createObligation:
      case CommandName.editObligation:
      case CommandName.cancelObligation:
        final created = command.name == CommandName.createObligation;
        obligation(created: created);
        identifier(
          'obligationInstanceId',
          created
              ? predictedCommandId(command.owner, command.id, 'instance')
              : payload['obligationInstanceId'] as String?,
        );
        positive('obligationRevision');
        positive('instanceRevision');
      case CommandName.createInstallment:
      case CommandName.editInstallment:
      case CommandName.cancelInstallment:
        obligation(created: command.name == CommandName.createInstallment);
        positive('obligationRevision');
        final raw = reader.value('obligationInstanceIds');
        if (raw is! List ||
            raw.length < 2 ||
            raw.length > 120 ||
            raw.any((id) => id is! String)) {
          throw const FormatException();
        }
        final ids = raw.cast<String>().toSet();
        for (final id in ids) {
          CommandId(id);
        }
        final revisions = allocations('instanceRevisions', min: 2, max: 120);
        if (ids.length != raw.length ||
            ids.length != revisions.length ||
            !ids.containsAll(revisions)) {
          throw const FormatException();
        }
      case CommandName.recordPayment:
      case CommandName.recordInstallmentPayment:
        obligation();
        identifier('paymentId');
        positive('obligationRevision');
        paymentPeriods(
          installment: command.name == CommandName.recordInstallmentPayment,
        );
      case CommandName.correctPayment:
        obligation();
        final original = identifier(
          'originalPaymentId',
          payload['paymentId'] as String,
        );
        final reversal = identifier('reversalId');
        final replacement = nullableId('replacementId');
        if (original == reversal ||
            replacement == original ||
            replacement == reversal ||
            (payload['replacement'] == null) != (replacement == null)) {
          throw const FormatException();
        }
        positive('obligationRevision');
        paymentPeriods(installment: true);
      case CommandName.createRecurring:
      case CommandName.editRecurring:
      case CommandName.changeRecurringLifecycle:
        obligation(created: command.name == CommandName.createRecurring);
        positive('obligationRevision');
        positive('generationRevision');
        if (frozen.containsKey('firstInstanceId')) {
          nullableId('firstInstanceId');
        }
        if (frozen.containsKey('appliesAfter')) {
          reader.nullableDate('appliesAfter');
        }
        if (frozen.containsKey('retainedFutureCount')) {
          reader.integer('retainedFutureCount');
        }
      case CommandName.setRecurringAmount:
      case CommandName.editRecurringInstance:
      case CommandName.skipRecurringInstance:
        obligation();
        identifier('instanceId', payload['instanceId'] as String);
        positive('instanceRevision');
      case CommandName.confirmDeduction:
      case CommandName.reportDeductionFailure:
        obligation();
        identifier('instanceId', payload['instanceId'] as String);
        positive('obligationRevision');
        positive('instanceRevision');
        if (command.name == CommandName.confirmDeduction) {
          identifier('paymentId');
          nullableId('evidenceId');
        } else {
          nullableId('reversalId');
          identifier('attemptId');
        }
      case CommandName.saveCatalog:
        final kind = payload['kind'] as String;
        identifier(
          'id',
          payload['id'] as String? ??
              predictedCommandId(command.owner, command.id, kind),
        );
        positive('revision');
      case CommandName.setObligationReminder:
        obligation();
        positive('obligationRevision');
        positive('reminderRevision');
      case CommandName.updateNotificationPreferences:
        positive('preferenceRevision');
    }
    return frozen;
  } catch (_) {
    throw const UnverifiedCommandResponse();
  }
}
