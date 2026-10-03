import 'money.dart';

abstract final class MoneyFormatter {
  static String format(Money money, {bool includeCode = false}) {
    final exponent = money.currency.exponent;
    final digits = money.minorUnits.abs().toString().padLeft(exponent + 1, '0');
    final split = digits.length - exponent;
    final whole = digits.substring(0, split);
    final fraction = digits.substring(split);
    final grouped = StringBuffer();
    for (var i = 0; i < whole.length; i++) {
      if (i > 0 && (whole.length - i) % 3 == 0) grouped.write(',');
      grouped.write(whole[i]);
    }
    final decimals = fraction.replaceAll('0', '').isEmpty ? '' : '.$fraction';
    final sign = money.minorUnits < 0 ? '-' : '';
    final code = includeCode ? ' ${money.currency.code}' : '';
    return '$sign${money.currency.symbol}$grouped$decimals$code';
  }
}
