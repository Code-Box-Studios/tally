import '../../../core/dates/local_date.dart';
import '../../../core/errors/app_failure.dart';
import '../../../core/money/money.dart';

final class InstallmentTerm {
  const InstallmentTerm(this.amount, this.dueDate);
  final Money amount;
  final LocalDate dueDate;
  Map<String, Object?> toPayload() => {
    'amountMinor': amount.minorUnits,
    'dueDate': dueDate.toString(),
  };
}

final class InstallmentSchedule {
  InstallmentSchedule({
    required this.principal,
    required this.originationDate,
    required List<InstallmentTerm> terms,
  }) : terms = List.unmodifiable(terms) {
    if (principal.minorUnits < 1 ||
        principal.minorUnits > 1000000000000 ||
        terms.length < 2 ||
        terms.length > 120) {
      throw _invalid();
    }
    var previous = originationDate;
    var sum = Money.fromMinorUnits(0, principal.currency);
    for (final term in terms) {
      if (term.amount.minorUnits < 1 ||
          term.amount.minorUnits > 1000000000000 ||
          term.dueDate.compareTo(previous) < 0) {
        throw _invalid();
      }
      previous = term.dueDate;
      sum = sum.add(term.amount);
    }
    if (sum != principal) throw _invalid();
  }
  factory InstallmentSchedule.equal({
    required Money principal,
    required LocalDate originationDate,
    required List<LocalDate> dueDates,
  }) {
    final count = dueDates.length;
    if (count < 2 || count > 120) throw _invalid();
    final base = (BigInt.from(principal.minorUnits) ~/ BigInt.from(count))
        .toInt();
    return InstallmentSchedule(
      principal: principal,
      originationDate: originationDate,
      terms: [
        for (var i = 0; i < count; i++)
          InstallmentTerm(
            Money.fromMinorUnits(
              i == count - 1 ? principal.minorUnits - base * (count - 1) : base,
              principal.currency,
            ),
            dueDates[i],
          ),
      ],
    );
  }
  static AppFailure _invalid() => AppFailure(
    AppFailureCode.invalidAmount,
    messageKey: 'installments.invalidSchedule',
  );
  final Money principal;
  final LocalDate originationDate;
  final List<InstallmentTerm> terms;
  LocalDate get maturity => terms.last.dueDate;
}
