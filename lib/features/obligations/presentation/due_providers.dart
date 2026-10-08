import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/domain/data_page.dart';
import '../../../shared/presentation/financial_providers.dart';
import '../data/firestore_due_repository.dart';
import '../domain/due_query.dart';
import '../domain/due_repository.dart';
import '../domain/obligation_instance.dart';

final dueRepositoryProvider = Provider<DueRepository>(
  (ref) => FirestoreDueRepository(
    ref.watch(ownerDocumentGatewayProvider),
    ref.watch(rawOwnerCommandGatewayProvider),
  ),
  dependencies: [ownerDocumentGatewayProvider, rawOwnerCommandGatewayProvider],
);
final duePageProvider = StreamProvider.autoDispose
    .family<DataPage<ObligationInstance>, DueQuery>(
      (ref, query) => ref.watch(dueRepositoryProvider).watchDue(query),
      dependencies: [dueRepositoryProvider],
    );
