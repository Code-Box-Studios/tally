import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/presentation/financial_providers.dart';
import '../../obligations/domain/obligation.dart';
import '../../obligations/domain/obligation_instance.dart';
import '../data/firestore_search_repository.dart';
import '../domain/period_query.dart';
import '../domain/query_page.dart';

final searchRepositoryProvider = Provider<FirestoreSearchRepository>((ref) {
  final repository = FirestoreSearchRepository(
    ref.watch(ownerDocumentGatewayProvider),
  );
  ref.onDispose(repository.dispose);
  return repository;
}, dependencies: [ownerDocumentGatewayProvider]);
final obligationSearchProvider = StreamProvider.autoDispose
    .family<QueryPage<Obligation>, PeriodQuery>(
      (ref, key) => ref
          .watch(searchRepositoryProvider)
          .watchObligations(key.filter, key.now),
      dependencies: [searchRepositoryProvider],
    );
final calendarPageProvider = StreamProvider.autoDispose
    .family<QueryPage<ObligationInstance>, PeriodQuery>(
      (ref, query) => ref.watch(searchRepositoryProvider).watchPeriods(query),
      dependencies: [searchRepositoryProvider],
    );
