import 'dart:convert';

import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/financial_failure.dart';
import 'command_identity.dart';
import 'command_name.dart';
import 'frozen_command.dart';
import 'outbox_store.dart';
import 'outbox_entry.dart';

typedef CachedPaymentObligation = Future<ObligationId?> Function(PaymentId id);

/// Resolves local creation references without rewriting revisions or money.
final class CommandDependencies {
  const CommandDependencies({
    required this.store,
    this.cachedPaymentObligation,
  });
  final OutboxStore store;
  final CachedPaymentObligation? cachedPaymentObligation;
  OwnerUid get owner => store.owner;

  Future<FrozenCommand> freeze(
    CommandName name,
    CommandId id,
    Map<String, Object?> payload,
    DateTime createdAt,
  ) async {
    final frozen = freezeCommandJson(payload);
    final existing = await store.get(id);
    if (existing != null) {
      if (existing.command.name != name ||
          existing.command.payloadJson != jsonEncode(frozen)) {
        throw const FinancialFailure(
          FinancialFailureCode.conflict,
          'This saved action already has different details. Keep its original history.',
        );
      }
      // Accepted dependencies may have left the pending query since the first
      // attempt. Retrying reuses their original frozen identities, too.
      return existing.command;
    }
    final references = <String>{};
    void collect(Map<String, Object?> values) {
      for (final key in [
        'contactId',
        'categoryId',
        'paymentSourceId',
        'obligationId',
        'instanceId',
        'obligationInstanceId',
      ]) {
        if (values[key] case final String value) references.add(value);
      }
    }

    collect(frozen);
    if (name == CommandName.saveCatalog && frozen['id'] is String) {
      references.add(frozen['id'] as String);
    }
    if (frozen['replacement'] case final Map<String, Object?> replacement) {
      collect(replacement);
    }
    if (frozen['explicitAllocations'] case final List<Object?> allocations) {
      for (final allocation in allocations) {
        collect(Map<String, Object?>.from(allocation as Map));
      }
    }
    final creations = await store.findCreations({
      for (final reference in references)
        for (final kind in ['obligation', 'contact', 'source', 'category'])
          '$kind:$reference',
    });
    final bindings = <String, FrozenCommand>{};
    for (final entry in creations) {
      if (entry.state == OutboxState.accepted) continue;
      final parent = entry.command;
      if (parent.name == CommandName.createObligation ||
          parent.name == CommandName.createInstallment ||
          parent.name == CommandName.createRecurring) {
        bindings[predictedCommandId(owner, parent.id, 'obligation')] = parent;
        if (parent.name == CommandName.createObligation) {
          bindings[predictedCommandId(owner, parent.id, 'instance')] = parent;
        }
      } else if (parent.name == CommandName.saveCatalog &&
          parent.payload['id'] == null) {
        final kind = parent.payload['kind'];
        if (kind == 'contact' || kind == 'source' || kind == 'category') {
          bindings[predictedCommandId(owner, parent.id, kind as String)] =
              parent;
        }
      }
    }
    final parent = bindings[frozen['obligationId']];
    if (parent != null &&
        parent.name != CommandName.createObligation &&
        [
          CommandName.recordPayment,
          CommandName.recordInstallmentPayment,
          CommandName.setRecurringAmount,
          CommandName.editRecurringInstance,
          CommandName.skipRecurringInstance,
          CommandName.confirmDeduction,
          CommandName.reportDeductionFailure,
        ].contains(name)) {
      throw const FinancialFailure(
        FinancialFailureCode.recovery,
        'Sync this schedule first. Its billing periods must be confirmed before recording a payment.',
      );
    }
    String resource;
    switch (name) {
      case CommandName.createObligation:
      case CommandName.createInstallment:
      case CommandName.createRecurring:
        resource = 'obligation:${predictedCommandId(owner, id, 'obligation')}';
      case CommandName.saveCatalog:
        final kind = frozen['kind'];
        if (kind != 'contact' && kind != 'source' && kind != 'category') {
          throw ArgumentError('Invalid catalog type.');
        }
        final item =
            frozen['id'] as String? ??
            predictedCommandId(owner, id, kind as String);
        resource = '$kind:$item';
        references.add(item);
      case CommandName.updateNotificationPreferences:
        resource = 'notifications:preferences';
      case CommandName.correctPayment:
        final payment = PaymentId(frozen['paymentId'] as String);
        final obligation = await cachedPaymentObligation?.call(payment);
        if (obligation == null) {
          throw const FinancialFailure(
            FinancialFailureCode.recovery,
            'Open this payment history while connected before saving a correction. Your draft has been kept.',
          );
        }
        resource = 'obligation:${obligation.value}';
      default:
        resource =
            'obligation:${ObligationId(frozen['obligationId'] as String).value}';
    }
    final parents = {
      for (final reference in references)
        if (bindings[reference] case final FrozenCommand parent) parent.id,
    };
    return FrozenCommand(
      owner: owner,
      id: id,
      name: name,
      payload: frozen,
      resourceKey: resource,
      createdAt: createdAt,
      dependencies: [
        for (final parent in parents) CommandDependency(owner, parent),
      ],
    );
  }
}
