import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/environment.dart';
import '../../../core/config/environment_providers.dart';
import '../../../core/dates/year_month.dart';
import '../../../core/money/currency_code.dart';
import '../data/empty_dashboard_repository.dart';
import '../data/preview_dashboard_repository.dart';
import '../domain/dashboard_repository.dart';
import '../domain/dashboard_summary.dart';

class SelectedCurrencyController extends Notifier<CurrencyCode> {
  @override
  CurrencyCode build() => CurrencyCode.php;
  void setCurrency(CurrencyCode value) => state = value;
}

final selectedCurrencyProvider =
    NotifierProvider<SelectedCurrencyController, CurrencyCode>(
      SelectedCurrencyController.new,
    );
final dashboardRepositoryProvider = Provider<DashboardRepository>(
  (ref) => ref.watch(environmentProvider).mode == AppEnvironment.preview
      ? PreviewDashboardRepository()
      : EmptyDashboardRepository(),
);
final dashboardSummaryProvider = StreamProvider<DashboardSummary>(
  (ref) => ref
      .watch(dashboardRepositoryProvider)
      .watchSummary(
        DashboardQuery(
          currency: ref.watch(selectedCurrencyProvider),
          month: YearMonth.parse('2026-10'),
        ),
      ),
);
