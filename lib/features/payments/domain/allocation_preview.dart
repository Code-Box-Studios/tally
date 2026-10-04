import '../../../core/errors/app_failure.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/money.dart';
import '../../obligations/domain/obligation.dart';
import '../../obligations/domain/obligation_instance.dart';
import 'payment_entry.dart';

abstract final class AllocationPreview {
  static AppFailure _invalid() => AppFailure(
    AppFailureCode.invalidAmount,
    messageKey: 'payments.invalidAllocations',
  );

  static List<PaymentAllocation> forPayment(
    Money amount,
    List<ObligationInstance> instances, {
    List<PaymentAllocation> restore = const [],
    List<InstanceId>? expectedInstanceIds,
  }) {
    if (amount.minorUnits < 1 ||
        instances.isEmpty ||
        instances.length > 120 ||
        instances.map((instance) => instance.id).toSet().length !=
            instances.length ||
        restore.length > 24 ||
        restore.map((a) => a.instanceId).toSet().length != restore.length) {
      throw _invalid();
    }
    final byId = {for (final instance in instances) instance.id: instance};
    if (expectedInstanceIds != null &&
        (expectedInstanceIds.length != instances.length ||
            expectedInstanceIds.toSet().length != instances.length ||
            expectedInstanceIds.any((id) => !byId.containsKey(id)))) {
      throw _invalid();
    }
    final first = instances.first;
    for (final instance in instances) {
      if (instance.owner != first.owner ||
          instance.obligationId != first.obligationId ||
          instance.currency != amount.currency ||
          instance.direction != first.direction ||
          instance.amount == null ||
          instance.remainingAmount == null ||
          instance.dueDate == null) {
        throw _invalid();
      }
    }
    final restored = <InstanceId, int>{};
    for (final allocation in restore) {
      final instance = byId[allocation.instanceId];
      if (instance == null ||
          allocation.amount.currency != amount.currency ||
          allocation.amount.minorUnits < 1 ||
          allocation.amount.minorUnits > instance.paidAmount.minorUnits ||
          instance.status == FinancialStatus.cancelled ||
          instance.status == FinancialStatus.skipped) {
        throw _invalid();
      }
      restored[allocation.instanceId] = allocation.amount.minorUnits;
    }
    final ordered = List<ObligationInstance>.of(instances)
      ..sort((a, b) {
        final dates = a.dueDate!.compareTo(b.dueDate!);
        return dates != 0 ? dates : a.id.value.compareTo(b.id.value);
      });
    var needed = amount.minorUnits;
    final result = <PaymentAllocation>[];
    for (final instance in ordered) {
      if (needed == 0) break;
      if (instance.status == FinancialStatus.cancelled ||
          instance.status == FinancialStatus.skipped) {
        continue;
      }
      final available =
          instance.remainingAmount!.minorUnits + (restored[instance.id] ?? 0);
      if (available < 0 || available > instance.amount!.minorUnits) {
        throw _invalid();
      }
      if (available == 0) continue;
      final allocated = needed < available ? needed : available;
      result.add(
        PaymentAllocation(
          instance.id,
          Money.fromMinorUnits(allocated, amount.currency),
        ),
      );
      needed -= allocated;
      if (result.length > 24) throw _invalid();
    }
    if (needed != 0) throw _invalid();
    return List.unmodifiable(result);
  }
}
