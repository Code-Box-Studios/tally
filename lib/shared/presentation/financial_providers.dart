import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/firebase/firebase_providers.dart';
import '../../core/identifiers/entity_ids.dart';
import '../../features/auth/presentation/auth_providers.dart';
import '../../features/obligations/data/firestore_obligations_repository.dart';
import '../../features/obligations/domain/obligation.dart';
import '../../features/obligations/domain/obligation_instance.dart';
import '../../features/obligations/domain/obligations_repository.dart';
import '../../features/payments/data/firestore_payments_repository.dart';
import '../../features/payments/domain/payment_entry.dart';
import '../../features/payments/domain/payments_repository.dart';
import '../data/firebase_owner_gateways.dart';
import '../data/firestore_catalog_repository.dart';
import '../data/owner_command_gateway.dart';
import '../data/owner_document_gateway.dart';
import '../domain/catalog.dart';
import '../domain/catalog_repository.dart';
import '../domain/data_page.dart';

typedef OwnerDocumentsFactory = OwnerDocumentGateway Function(OwnerUid owner);
typedef OwnerCommandsFactory = OwnerCommandGateway Function(OwnerUid owner);
final ownerDocumentsFactoryProvider = Provider<OwnerDocumentsFactory>((ref) {
  final firestore = ref.watch(firebaseClientsProvider).firestore;
  return (owner) => FirebaseOwnerDocuments(firestore, owner);
});
final ownerCommandsFactoryProvider = Provider<OwnerCommandsFactory>((ref) {
  final functions = ref.watch(firebaseClientsProvider).functions;
  return (owner) => FirebaseOwnerCommands(functions, owner);
});
final ownerDocumentGatewayProvider = Provider<OwnerDocumentGateway>(
  (ref) =>
      ref.watch(ownerDocumentsFactoryProvider)(ref.watch(ownerUidProvider)),
  dependencies: [ownerUidProvider],
);
final ownerCommandGatewayProvider = Provider<OwnerCommandGateway>(
  (ref) => ref.watch(ownerCommandsFactoryProvider)(ref.watch(ownerUidProvider)),
  dependencies: [ownerUidProvider],
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
    .family<Obligation?, ObligationId>(
      (ref, id) => ref.watch(obligationsRepositoryProvider).watchObligation(id),
      dependencies: [obligationsRepositoryProvider],
    );
final instancesPageProvider = StreamProvider.autoDispose
    .family<DataPage<ObligationInstance>, ObligationId>(
      (ref, id) => ref.watch(obligationsRepositoryProvider).watchInstances(id),
      dependencies: [obligationsRepositoryProvider],
    );
final paymentsPageProvider = StreamProvider.autoDispose
    .family<DataPage<PaymentEntry>, ObligationId>(
      (ref, id) => ref.watch(paymentsRepositoryProvider).watchPayments(id),
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
final categoriesPageProvider = StreamProvider.autoDispose<DataPage<Category>>(
  (ref) => ref.watch(catalogRepositoryProvider).watchCategories(),
  dependencies: [catalogRepositoryProvider],
);
