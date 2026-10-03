enum AppFailureCode {
  invalidAmount,
  unsupportedCurrency,
  currencyMismatch,
  overflow,
  invalidDate,
  invalidId,
  invalidEnvironment,
  unavailable,
}

final class AppFailure implements Exception {
  AppFailure(
    this.code, {
    required this.messageKey,
    this.retryable = false,
    Map<String, String> fieldErrors = const {},
  }) : fieldErrors = Map.unmodifiable(fieldErrors);

  final AppFailureCode code;
  final String messageKey;
  final bool retryable;
  final Map<String, String> fieldErrors;

  @override
  String toString() => 'AppFailure($messageKey)';
}
