import 'package:test/test.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/core/money/money.dart';
import 'package:tally/core/money/money_formatter.dart';

void main() {
  test('formats whole and fractional PHP without floating point', () {
    expect(
      MoneyFormatter.format(Money.parse('10000', CurrencyCode.php)),
      '₱10,000',
    );
    expect(
      MoneyFormatter.format(Money.parse('2500.50', CurrencyCode.php)),
      '₱2,500.50',
    );
    expect(
      MoneyFormatter.format(Money.parse('0.01', CurrencyCode.php)),
      '₱0.01',
    );
    expect(
      MoneyFormatter.format(Money.fromMinorUnits(0, CurrencyCode.php)),
      '₱0',
    );
  });
  test('signed positions and JPY use their exact exponent', () {
    expect(
      MoneyFormatter.format(Money.fromMinorUnits(-50000, CurrencyCode.php)),
      '-₱500',
    );
    expect(
      MoneyFormatter.format(Money.parse('1234', CurrencyCode.jpy)),
      '¥1,234',
    );
  });
  test('a currency code disambiguates dollar symbols', () {
    expect(
      MoneyFormatter.format(
        Money.parse('500', CurrencyCode.usd),
        includeCode: true,
      ),
      r'$500 USD',
    );
    expect(
      MoneyFormatter.format(
        Money.parse('500', CurrencyCode.sgd),
        includeCode: true,
      ),
      r'S$500 SGD',
    );
    expect(
      MoneyFormatter.format(
        Money.parse('500', CurrencyCode.aud),
        includeCode: true,
      ),
      r'A$500 AUD',
    );
  });
  test('safe-limit formatting keeps the last centavo exact on web', () {
    expect(
      MoneyFormatter.format(
        Money.fromMinorUnits(9007199254740991, CurrencyCode.php),
      ),
      '₱90,071,992,547,409.91',
    );
  });
}
