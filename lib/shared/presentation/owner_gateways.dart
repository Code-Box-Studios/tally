import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/firebase/firebase_providers.dart';
import '../../core/identifiers/entity_ids.dart';
import '../../features/auth/presentation/auth_providers.dart';
import '../data/firebase_owner_gateways.dart';
import '../data/owner_command_gateway.dart';
import '../data/owner_document_gateway.dart';

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
final rawOwnerCommandGatewayProvider = Provider<OwnerCommandGateway>(
  (ref) => ref.watch(ownerCommandsFactoryProvider)(ref.watch(ownerUidProvider)),
  dependencies: [ownerUidProvider],
);
