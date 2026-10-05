import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/data_page.dart';
import '../../../shared/presentation/financial_providers.dart';
import '../../obligations/domain/obligation_instance.dart';
import '../data/firestore_recurring_repository.dart';
import '../domain/recurring_repository.dart';
import '../domain/deduction_attempt.dart';

final recurringRepositoryProvider = Provider<RecurringRepository>(
  (ref) => FirestoreRecurringRepository(
    ref.watch(ownerDocumentGatewayProvider),
    ref.watch(ownerCommandGatewayProvider),
  ),
  dependencies: [ownerDocumentGatewayProvider, ownerCommandGatewayProvider],
);
final recurringPeriodsProvider = StreamProvider.autoDispose
    .family<DataPage<ObligationInstance>, ObligationId>(
      (ref, id) => ref.watch(recurringRepositoryProvider).watchPeriods(id),
      dependencies: [recurringRepositoryProvider],
    );
final deductionAttemptsProvider = StreamProvider.autoDispose
    .family<DataPage<DeductionAttempt>, InstanceId>(
      (ref, id) => ref.watch(recurringRepositoryProvider).watchAttempts(id),
      dependencies: [recurringRepositoryProvider],
    );
final paymentEvidenceProvider = StreamProvider.autoDispose
    .family<DataPage<PaymentEvidence>, InstanceId>(
      (ref, id) => ref.watch(recurringRepositoryProvider).watchEvidence(id),
      dependencies: [recurringRepositoryProvider],
    );
