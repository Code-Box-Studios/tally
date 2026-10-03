import '../errors/app_failure.dart';

enum CurrencyCode {
  php('PHP', 2, '₱'),
  usd('USD', 2, r'$'),
  eur('EUR', 2, '€'),
  sgd('SGD', 2, r'S$'),
  aud('AUD', 2, r'A$'),
  jpy('JPY', 0, '¥'),
  gbp('GBP', 2, '£');

  const CurrencyCode(this.code, this.exponent, this.symbol);
  final String code;
  final int exponent;
  final String symbol;

  static CurrencyCode parse(String code) {
    for (final currency in values) {
      if (currency.code == code) return currency;
    }
    throw AppFailure(
      AppFailureCode.unsupportedCurrency,
      messageKey: 'money.unsupportedCurrency',
    );
  }
}
