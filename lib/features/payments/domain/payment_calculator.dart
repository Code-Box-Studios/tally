import '../../../core/errors/app_failure.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/money.dart';
import 'payment_entry.dart';

final class PaymentBalance {
  const PaymentBalance(this.paid, this.remaining);
  final Money paid, remaining;
}

abstract final class PaymentCalculator {
  static PaymentBalance balance(
    Money original,
    Iterable<PaymentEntry> entries,
  ) {
    final list = entries.toList();
    final byId = <PaymentId, PaymentEntry>{};
    for (final entry in list) {
      if (entry.amount.currency != original.currency) {
        throw AppFailure(
          AppFailureCode.currencyMismatch,
          messageKey: 'payment.currencyMismatch',
        );
      }
      if (entry.amount.minorUnits <= 0 ||
          byId.containsKey(entry.id) ||
          (list.isNotEmpty &&
              (entry.owner != list.first.owner ||
                  entry.obligationId != list.first.obligationId))) {
        throw _invalid();
      }
      byId[entry.id] = entry;
    }
    final reversed = <PaymentId>{};
    var paid = Money.fromMinorUnits(0, original.currency);
    for (final entry in list) {
      if (entry.type == PaymentEntryType.payment) {
        paid = paid.add(entry.amount);
        continue;
      }
      final originalEntry = byId[entry.reversesPaymentId];
      if (originalEntry == null ||
          originalEntry.type != PaymentEntryType.payment ||
          originalEntry.amount != entry.amount ||
          !reversed.add(originalEntry.id) ||
          originalEntry.allocations.length != entry.allocations.length) {
        throw _invalid();
      }
      for (var i = 0; i < entry.allocations.length; i++) {
        if (originalEntry.allocations[i].instanceId !=
                entry.allocations[i].instanceId ||
            originalEntry.allocations[i].amount !=
                entry.allocations[i].amount) {
          throw _invalid();
        }
      }
      paid = paid.subtract(entry.amount);
    }
    if (paid.minorUnits < 0 || paid.minorUnits > original.minorUnits) {
      throw _invalid();
    }
    return PaymentBalance(paid, original.subtract(paid));
  }

  static AppFailure _invalid() => AppFailure(
    AppFailureCode.unavailable,
    messageKey: 'payment.historyInvalid',
  );
}
