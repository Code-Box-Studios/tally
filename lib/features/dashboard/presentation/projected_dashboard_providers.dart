import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../../../shared/domain/data_page.dart';
import '../../../shared/presentation/financial_providers.dart';
import '../../auth/presentation/auth_providers.dart';
import '../data/firestore_dashboard_repository.dart';
import '../domain/dashboard_repository.dart';
import '../domain/dashboard_summary.dart';

class PrivateCurrencyController extends Notifier<CurrencyCode> {
  @override
  CurrencyCode build() {
    ref.watch(ownerUidProvider);
    return ref.watch(
      userProfileProvider.select((profile) => profile.defaultCurrency),
    );
  }

  void select(CurrencyCode currency) => state = currency;
}

final privateCurrencyProvider =
    NotifierProvider<PrivateCurrencyController, CurrencyCode>(
      PrivateCurrencyController.new,
      dependencies: [ownerUidProvider, userProfileProvider],
    );
final projectedDashboardRepositoryProvider =
    Provider<ProjectedDashboardRepository>(
      (ref) => FirestoreDashboardRepository(
        ref.watch(ownerDocumentGatewayProvider),
        ref.watch(ownerCommandGatewayProvider),
      ),
      dependencies: [ownerDocumentGatewayProvider, ownerCommandGatewayProvider],
    );
final projectedDashboardProvider = StreamProvider.autoDispose
    .family<DataRecord<ProjectedDashboardSummary?>, CurrencyCode>(
      (ref, currency) => ref
          .watch(projectedDashboardRepositoryProvider)
          .watchSummary(currency),
      dependencies: [projectedDashboardRepositoryProvider],
    );
final ledgerStateProvider =
    StreamProvider.autoDispose<DataRecord<LedgerState?>>(
      (ref) => ref.watch(projectedDashboardRepositoryProvider).watchLedger(),
      dependencies: [projectedDashboardRepositoryProvider],
    );
final projectedContactProvider = StreamProvider.autoDispose
    .family<DataRecord<ProjectedContactSummary?>, ContactId>(
      (ref, contact) =>
          ref.watch(projectedDashboardRepositoryProvider).watchContact(contact),
      dependencies: [projectedDashboardRepositoryProvider],
    );
