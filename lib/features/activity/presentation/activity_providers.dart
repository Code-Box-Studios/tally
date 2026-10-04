import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/domain/data_page.dart';
import '../../../shared/presentation/financial_providers.dart';
import '../data/firestore_activity_repository.dart';
import '../domain/activity_entry.dart';
import '../domain/activity_repository.dart';

final activityRepositoryProvider = Provider<ActivityRepository>(
  (ref) => FirestoreActivityRepository(
    ref.watch(ownerDocumentGatewayProvider),
    ref.watch(ownerCommandGatewayProvider),
  ),
  dependencies: [ownerDocumentGatewayProvider, ownerCommandGatewayProvider],
);
final activityPageProvider =
    StreamProvider.autoDispose<DataPage<ActivityEntry>>(
      (ref) => ref.watch(activityRepositoryProvider).watchActivity(),
      dependencies: [activityRepositoryProvider],
    );
