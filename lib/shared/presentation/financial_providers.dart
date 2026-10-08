import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/environment.dart';
import '../../core/config/environment_providers.dart';
import '../../features/sync/presentation/sync_providers.dart';
import 'owner_gateways.dart';
export 'owner_gateways.dart';
import '../../core/identifiers/entity_ids.dart';
import '../../features/auth/presentation/auth_providers.dart';
import '../../features/obligations/data/firestore_obligations_repository.dart';
import '../../features/obligations/domain/obligation.dart';
import '../../features/obligations/domain/obligation_instance.dart';
import '../../features/obligations/domain/obligations_repository.dart';
import '../../features/payments/data/firestore_payments_repository.dart';
import '../../features/payments/domain/payment_entry.dart';
import '../../features/payments/domain/payments_repository.dart';

import '../data/firestore_catalog_repository.dart';
import '../data/owner_command_gateway.dart';

import '../domain/catalog.dart';
import '../domain/catalog_repository.dart';
import '../domain/data_page.dart';

final ownerCommandGatewayProvider = Provider<OwnerCommandGateway>(
  (ref) {
    final raw = ref.watch(rawOwnerCommandGatewayProvider);
    if (ref.watch(environmentProvider).mode == AppEnvironment.preview) {
      return raw;
    }
    final owner = ref.watch(ownerUidProvider);
    return DeferredOwnerCommands(
      owner,
      () => ref.read(syncRuntimeProvider.future),
      () => ref.mounted,
    );
  },
  dependencies: [
    ownerUidProvider,
    rawOwnerCommandGatewayProvider,
    syncRuntimeProvider,
  ],
);
final obligationsRepositoryProvider = Provider<ObligationsRepository>(
  (ref) => FirestoreObligationsRepository(
    ref.watch(ownerDocumentGatewayProvider),
    ref.watch(ownerCommandGatewayProvider),
  ),
  dependencies: [ownerDocumentGatewayProvider, ownerCommandGatewayProvider],
);
final paymentsRepositoryProvider = Provider<PaymentsRepository>(
  (ref) => FirestorePaymentsRepository(
    ref.watch(ownerDocumentGatewayProvider),
    ref.watch(ownerCommandGatewayProvider),
  ),
  dependencies: [ownerDocumentGatewayProvider, ownerCommandGatewayProvider],
);
final catalogRepositoryProvider = Provider<CatalogRepository>(
  (ref) => FirestoreCatalogRepository(
    ref.watch(ownerDocumentGatewayProvider),
    ref.watch(ownerCommandGatewayProvider),
  ),
  dependencies: [ownerDocumentGatewayProvider, ownerCommandGatewayProvider],
);

final obligationsPageProvider = StreamProvider.autoDispose
    .family<DataPage<Obligation>, ObligationSection?>(
      (ref, section) => ref
          .watch(obligationsRepositoryProvider)
          .watchObligations(section: section),
      dependencies: [obligationsRepositoryProvider],
    );
final obligationProvider = StreamProvider.autoDispose
    .family<DataRecord<Obligation?>, ObligationId>(
      (ref, id) => ref.watch(obligationsRepositoryProvider).watchObligation(id),
      dependencies: [obligationsRepositoryProvider],
    );
final instancesPageProvider = StreamProvider.autoDispose
    .family<DataPage<ObligationInstance>, ObligationId>(
      (ref, id) => ref.watch(obligationsRepositoryProvider).watchInstances(id),
      dependencies: [obligationsRepositoryProvider],
    );
final instanceProvider = StreamProvider.autoDispose
    .family<DataRecord<ObligationInstance?>, InstanceId>(
      (ref, id) => ref.watch(obligationsRepositoryProvider).watchInstance(id),
      dependencies: [obligationsRepositoryProvider],
    );
final paymentsPageProvider = StreamProvider.autoDispose
    .family<DataPage<PaymentEntry>, ObligationId>(
      (ref, id) => ref.watch(paymentsRepositoryProvider).watchPayments(id),
      dependencies: [paymentsRepositoryProvider],
    );
typedef PeriodPaymentKey = ({ObligationId parent, InstanceId period});
final periodPaymentsPageProvider = StreamProvider.autoDispose
    .family<DataPage<PaymentEntry>, PeriodPaymentKey>(
      (ref, key) => ref
          .watch(paymentsRepositoryProvider)
          .watchPeriodPayments(key.parent, key.period),
      dependencies: [paymentsRepositoryProvider],
    );
final contactsPageProvider = StreamProvider.autoDispose<DataPage<Contact>>(
  (ref) => ref.watch(catalogRepositoryProvider).watchContacts(),
  dependencies: [catalogRepositoryProvider],
);
final sourcesPageProvider = StreamProvider.autoDispose<DataPage<PaymentSource>>(
  (ref) => ref.watch(catalogRepositoryProvider).watchSources(),
  dependencies: [catalogRepositoryProvider],
);
final contactProvider = StreamProvider.autoDispose
    .family<DataRecord<Contact?>, ContactId>(
      (ref, id) => ref.watch(catalogRepositoryProvider).watchContact(id),
      dependencies: [catalogRepositoryProvider],
    );
final contactObligationsProvider = StreamProvider.autoDispose
    .family<DataPage<Obligation>, ContactId>(
      (ref, id) => ref
          .watch(obligationsRepositoryProvider)
          .watchObligations(contact: id),
      dependencies: [obligationsRepositoryProvider],
    );
final categoriesPageProvider = StreamProvider.autoDispose<DataPage<Category>>(
  (ref) => ref.watch(catalogRepositoryProvider).watchCategories(),
  dependencies: [catalogRepositoryProvider],
);
