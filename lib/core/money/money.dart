import 'currency_code.dart';
import '../errors/app_failure.dart';

final class Money {
  const Money._(this.minorUnits, this.currency);
  factory Money.fromMinorUnits(int minorUnits, CurrencyCode currency) =>
      Money._checked(BigInt.from(minorUnits), currency);

  /// Parses entry text without rounding or converting through binary doubles.
  factory Money.parse(
    String text,
    CurrencyCode currency, {
    bool allowZero = false,
  }) {
    final input = text.trim();
    final match = input.length <= 64 ? _decimal.firstMatch(input) : null;
    if (match == null) throw _invalidAmount();
    final fraction = match.group(2) ?? '';
    if (fraction.length > currency.exponent) throw _invalidAmount();
    final scale = BigInt.from(10).pow(currency.exponent);
    final fractional = fraction.isEmpty
        ? BigInt.zero
        : BigInt.parse(fraction.padRight(currency.exponent, '0'));
    final minor = BigInt.parse(match.group(1)!) * scale + fractional;
    if (minor > _entryMaximum ||
        minor < BigInt.zero ||
        (!allowZero && minor == BigInt.zero)) {
      throw _invalidAmount();
    }
    return Money._checked(minor, currency);
  }

  factory Money._checked(BigInt minorUnits, CurrencyCode currency) {
    if (minorUnits.abs() > _safeMaximum) {
      throw AppFailure(AppFailureCode.overflow, messageKey: 'money.overflow');
    }
    return Money._(minorUnits.toInt(), currency);
  }

  static final _decimal = RegExp(r'^([0-9]+)(?:\.([0-9]+))?$');
  static final _safeMaximum = BigInt.parse('9007199254740991');
  static final _entryMaximum = BigInt.parse('1000000000000');
  static AppFailure _invalidAmount() => AppFailure(
    AppFailureCode.invalidAmount,
    messageKey: 'money.invalidAmount',
  );
  final int minorUnits;
  final CurrencyCode currency;
  Money add(Money other) {
    _requireCurrency(other);
    return Money._checked(
      BigInt.from(minorUnits) + BigInt.from(other.minorUnits),
      currency,
    );
  }

  Money subtract(Money other) {
    _requireCurrency(other);
    return Money._checked(
      BigInt.from(minorUnits) - BigInt.from(other.minorUnits),
      currency,
    );
  }

  void _requireCurrency(Money other) {
    if (other.currency != currency) {
      throw AppFailure(
        AppFailureCode.currencyMismatch,
        messageKey: 'money.currencyMismatch',
      );
    }
  }

  @override
  bool operator ==(Object other) =>
      other is Money &&
      other.minorUnits == minorUnits &&
      other.currency == currency;

  @override
  int get hashCode => Object.hash(minorUnits, currency);
}
