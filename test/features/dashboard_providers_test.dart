import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/config/environment_providers.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/features/dashboard/presentation/dashboard_providers.dart';

void main() {
  test('Currency switches never combine PHP and USD', () async {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    final subscription = c.listen(dashboardSummaryProvider, (_, _) {});
    addTearDown(subscription.close);
    for (final currency in [
      CurrencyCode.php,
      CurrencyCode.usd,
      CurrencyCode.php,
    ]) {
      c.read(selectedCurrencyProvider.notifier).setCurrency(currency);
      final summary = await c.read(dashboardSummaryProvider.future);
      expect(summary.currency, currency);
      expect(
        summary.owedToYou.minorUnits,
        currency == CurrencyCode.php ? 1250000 : 50000,
      );
    }
  });
  test('Emulator foundation exposes no synthetic private records', () async {
    final c = ProviderContainer(
      overrides: [
        environmentProvider.overrideWithValue(
          const EnvironmentConfig.emulator(
            projectId: 'demo-tally',
            endpoints: EmulatorEndpoints(host: '127.0.0.1'),
          ),
        ),
      ],
    );
    addTearDown(c.dispose);
    final subscription = c.listen(dashboardSummaryProvider, (_, _) {});
    addTearDown(subscription.close);
    final summary = await c.read(dashboardSummaryProvider.future);
    expect(summary.youOwe.minorUnits, 0);
    expect(summary.upcoming, isEmpty);
  });
}
