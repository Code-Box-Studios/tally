enum FinancialFailureCode {
  conflict,
  overpayment,
  offline,
  signIn,
  invalid,
  recovery,
  unavailable,
}

final class FinancialFailure implements Exception {
  const FinancialFailure(this.code, this.message, {this.remainingMinor});
  final FinancialFailureCode code;
  final String message;
  final int? remainingMinor;
  @override
  String toString() => message;
}
