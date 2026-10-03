import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/dates/local_date.dart';
import 'package:tally/core/dates/year_month.dart';
import 'package:tally/core/errors/app_failure.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/core/money/money.dart';
import 'package:tally/features/dashboard/data/preview_dashboard_repository.dart';
import 'package:tally/features/dashboard/domain/dashboard_summary.dart';

void main() {
  final month = YearMonth.parse('2026-10');
  test(
    'Exact fixtures stay immutable and isolated by currency/month',
    () async {
      final repo = PreviewDashboardRepository();
      final php = await repo
          .watchSummary(
            DashboardQuery(currency: CurrencyCode.php, month: month),
          )
          .first;
      expect(
        [
          php.youOwe.minorUnits,
          php.owedToYou.minorUnits,
          php.dueThisMonth.minorUnits,
          php.paidThisMonth.minorUnits,
          php.remainingThisMonth.minorUnits,
          php.overdue.minorUnits,
          php.netPosition.minorUnits,
        ],
        [2500000, 1250000, 1999800, 190000, 1809800, 160000, -1250000],
      );
      expect(() => php.upcoming.clear(), throwsUnsupportedError);
      final usd = await repo
          .watchSummary(
            DashboardQuery(currency: CurrencyCode.usd, month: month),
          )
          .first;
      expect(usd.owedToYou, Money.parse('500', CurrencyCode.usd));
      expect(usd.dueThisMonth.minorUnits, 0);
      expect(
        usd.upcoming.every((i) => i.remaining?.currency == CurrencyCode.usd),
        isTrue,
      );
      expect(php.youOwe.minorUnits, 2500000);
      final otherMonth = await repo
          .watchSummary(
            DashboardQuery(
              currency: CurrencyCode.php,
              month: YearMonth.parse('2026-11'),
            ),
          )
          .first;
      expect(otherMonth.youOwe.minorUnits, 0);
      expect(otherMonth.upcoming, isEmpty);
    },
  );
  test(
    'Summary rejects negative/mixed financial values including due rows',
    () {
      final zero = Money.fromMinorUnits(0, CurrencyCode.php);
      DashboardSummary summary(Money debt, List<DuePreviewItem> items) =>
          DashboardSummary(
            currency: CurrencyCode.php,
            month: month,
            asOfDate: LocalDate.parse('2026-10-03'),
            youOwe: debt,
            owedToYou: zero,
            dueThisMonth: zero,
            paidThisMonth: zero,
            remainingThisMonth: zero,
            overdue: zero,
            upcoming: items,
          );
      expect(
        () => summary(Money.fromMinorUnits(-1, CurrencyCode.php), []),
        throwsA(isA<AppFailure>()),
      );
      expect(
        () => summary(Money.parse('1', CurrencyCode.usd), []),
        throwsA(isA<AppFailure>()),
      );
      expect(
        () => summary(zero, [
          DuePreviewItem(
            title: 'Mixed',
            dueDate: LocalDate.parse('2026-10-04'),
            remaining: Money.parse('1', CurrencyCode.usd),
            section: PreviewSection.owedToMe,
            state: PreviewDueState.upcoming,
          ),
        ]),
        throwsA(isA<AppFailure>()),
      );
    },
  );
}
