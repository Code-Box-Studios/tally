import '../../../core/errors/app_failure.dart';
import '../../../core/money/money.dart';
import 'obligation.dart';
import 'obligation_instance.dart';

abstract final class InstallmentPeriods {
  static List<ObligationInstance> checked(
    Obligation parent,
    List<ObligationInstance> instances,
  ) {
    AppFailure invalid() => AppFailure(
      AppFailureCode.unavailable,
      messageKey: 'installments.incomplete',
    );
    if (parent.type != ObligationType.installment ||
        parent.installmentInstanceIds.length != instances.length ||
        instances.map((instance) => instance.id).toSet().length !=
            instances.length) {
      throw invalid();
    }
    final ids = parent.installmentInstanceIds.toSet();
    var amount = Money.fromMinorUnits(0, parent.currency),
        paid = Money.fromMinorUnits(0, parent.currency),
        remaining = Money.fromMinorUnits(0, parent.currency);
    for (final instance in instances) {
      if (!ids.contains(instance.id) ||
          instance.owner != parent.owner ||
          instance.obligationId != parent.id ||
          instance.currency != parent.currency ||
          instance.direction != parent.direction ||
          instance.amount == null ||
          instance.remainingAmount == null ||
          instance.dueDate == null) {
        throw invalid();
      }
      amount = amount.add(instance.amount!);
      paid = paid.add(instance.paidAmount);
      remaining = remaining.add(instance.remainingAmount!);
    }
    if (amount != parent.originalAmount ||
        paid != parent.paidAmount ||
        remaining != parent.remainingAmount) {
      throw invalid();
    }
    final byId = {for (final instance in instances) instance.id: instance};
    // Agreement order is immutable, even when multiple due dates are equal.
    return List.unmodifiable([
      for (final id in parent.installmentInstanceIds) byId[id]!,
    ]);
  }
}
