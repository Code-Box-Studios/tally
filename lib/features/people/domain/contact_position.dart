import '../../../core/money/currency_code.dart';
import '../../../core/money/money.dart';
import '../../obligations/domain/obligation.dart';

final class ContactPosition {
  const ContactPosition(this.youOwe, this.owedToYou);
  final Money youOwe, owedToYou;
  Money get net => owedToYou.subtract(youOwe);
}

abstract final class ContactPositionCalculator {
  static Map<CurrencyCode, ContactPosition> calculate(
    Iterable<Obligation> obligations,
  ) {
    final result = <CurrencyCode, ContactPosition>{};
    for (final obligation in obligations) {
      if (!obligation.isOutstanding || obligation.remainingAmount == null) {
        continue;
      }
      final zero = Money.fromMinorUnits(0, obligation.currency);
      final position =
          result[obligation.currency] ?? ContactPosition(zero, zero);
      result[obligation.currency] =
          obligation.direction == ObligationDirection.owedByMe
          ? ContactPosition(
              position.youOwe.add(obligation.remainingAmount!),
              position.owedToYou,
            )
          : ContactPosition(
              position.youOwe,
              position.owedToYou.add(obligation.remainingAmount!),
            );
    }
    return Map.unmodifiable(result);
  }
}
