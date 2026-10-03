import 'package:test/test.dart';
import 'package:tally/core/errors/app_failure.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/core/money/money.dart';

Matcher failure(AppFailureCode code) =>
    isA<AppFailure>().having((value) => value.code, 'code', code);

void main() {
  const php = CurrencyCode.php;

  test('partial payment leaves the exact unpaid balance', () {
    final remaining = Money.parse(
      '10000',
      php,
    ).subtract(Money.parse('3000', php));
    expect(remaining.minorUnits, 700000);
    expect(remaining.currency, php);
  });
  test('full payment leaves zero', () {
    expect(
      Money.parse('10000', php).subtract(Money.parse('10000', php)).minorUnits,
      0,
    );
  });
  test('multiple payments add without losing centavos', () {
    final paid = Money.parse(
      '5000',
      php,
    ).add(Money.parse('2500', php)).add(Money.parse('4000', php));
    expect(paid.minorUnits, 1150000);
    expect(Money.parse('20000', php).subtract(paid).minorUnits, 850000);
    expect(
      Money.parse('0.10', php).add(Money.parse('0.20', php)).minorUnits,
      30,
    );
  });
  test('decimal strings parse exactly including small and padded amounts', () {
    expect(Money.parse('0.01', php).minorUnits, 1);
    expect(Money.parse(' 2500.50 ', php).minorUnits, 250050);
    expect(Money.parse('0001.2', php).minorUnits, 120);
    expect(Money.parse('10000000000.00', php).minorUnits, 1000000000000);
  });
  for (final text in [
    '1.001',
    '1e3',
    'NaN',
    'Infinity',
    '1,000',
    '-1',
    '+1',
    '',
    '.',
    '  ',
    '1.',
    '.5',
    '1..2',
  ]) {
    test('rejects malformed money "$text" rather than rounding', () {
      expect(
        () => Money.parse(text, php),
        throwsA(failure(AppFailureCode.invalidAmount)),
      );
    });
  }
  test('zero is invalid for an entry but can be requested for a value', () {
    expect(
      () => Money.parse('0', php),
      throwsA(failure(AppFailureCode.invalidAmount)),
    );
    expect(Money.parse('0.00', php, allowZero: true).minorUnits, 0);
  });
  test('financial entry limit rejects an extra centavo', () {
    expect(
      () => Money.parse('10000000000.01', php),
      throwsA(failure(AppFailureCode.invalidAmount)),
    );
    expect(
      () => Money.parse('9' * 10000, php),
      throwsA(failure(AppFailureCode.invalidAmount)),
    );
  });
  test('JPY accepts whole yen and rejects fractions', () {
    expect(Money.parse('1234', CurrencyCode.jpy).minorUnits, 1234);
    expect(
      () => Money.parse('1.25', CurrencyCode.jpy),
      throwsA(failure(AppFailureCode.invalidAmount)),
    );
    expect(
      () => Money.parse('1.00', CurrencyCode.jpy),
      throwsA(failure(AppFailureCode.invalidAmount)),
    );
  });
  test('unsupported persisted currency never silently becomes PHP', () {
    expect(CurrencyCode.parse('USD'), CurrencyCode.usd);
    expect(
      () => CurrencyCode.parse('XYZ'),
      throwsA(failure(AppFailureCode.unsupportedCurrency)),
    );
    expect(
      () => CurrencyCode.parse('usd'),
      throwsA(failure(AppFailureCode.unsupportedCurrency)),
    );
  });
  test('two currencies cannot be added or subtracted', () {
    final usd = Money.parse('500', CurrencyCode.usd);
    expect(
      () => Money.parse('10000', php).add(usd),
      throwsA(failure(AppFailureCode.currencyMismatch)),
    );
    expect(
      () => Money.parse('10000', php).subtract(usd),
      throwsA(failure(AppFailureCode.currencyMismatch)),
    );
  });
  test('aggregate arithmetic permits an exact negative net position', () {
    expect(
      Money.parse('12500', php).subtract(Money.parse('25000', php)).minorUnits,
      -1250000,
    );
  });
  test('positive safe integer boundary is accepted but cannot overflow', () {
    final limit = Money.fromMinorUnits(9007199254740991, php);
    expect(limit.minorUnits, 9007199254740991);
    expect(
      () => limit.add(Money.fromMinorUnits(1, php)),
      throwsA(failure(AppFailureCode.overflow)),
    );
    expect(
      () => Money.fromMinorUnits(9007199254740992, php),
      throwsA(failure(AppFailureCode.overflow)),
    );
  });
  test('negative safe integer boundary cannot underflow', () {
    final limit = Money.fromMinorUnits(-9007199254740991, php);
    expect(
      () => limit.subtract(Money.fromMinorUnits(1, php)),
      throwsA(failure(AppFailureCode.overflow)),
    );
  });
  test('money equality preserves currency and hash compatibility', () {
    expect(Money.parse('1.00', php), Money.fromMinorUnits(100, php));
    expect(Money.parse('1', php), isNot(Money.parse('1', CurrencyCode.usd)));
    expect({Money.parse('1', php), Money.fromMinorUnits(100, php)}.length, 1);
  });
}
