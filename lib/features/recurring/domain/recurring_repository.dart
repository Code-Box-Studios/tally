import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/data_page.dart';
import '../../obligations/domain/obligation_instance.dart';
import 'deduction_attempt.dart';
import 'recurring_commands.dart';

abstract interface class RecurringRepository {
  OwnerUid get owner;
  Stream<DataPage<ObligationInstance>> watchPeriods(ObligationId id);
  Future<DataPage<ObligationInstance>> getPeriods(
    ObligationId id, {
    PageCursor? after,
  });
  Stream<DataPage<DeductionAttempt>> watchAttempts(InstanceId id);
  Future<DataPage<DeductionAttempt>> getAttempts(
    InstanceId id, {
    PageCursor? after,
  });
  Stream<DataPage<PaymentEvidence>> watchEvidence(InstanceId id);
  Future<DataPage<PaymentEvidence>> getEvidence(
    InstanceId id, {
    PageCursor? after,
  });
  Future<RecurringResult> create(RecurringDraft draft, CommandId commandId);
  Future<RecurringResult> edit(RecurringEdit change, CommandId commandId);
  Future<RecurringResult> changeLifecycle(
    LifecycleChange change,
    CommandId commandId,
  );
  Future<PeriodResult> setAmount(
    InstanceAmountEdit change,
    CommandId commandId,
  );
  Future<PeriodResult> editPeriod(
    RecurringInstanceEdit change,
    CommandId commandId,
  );
  Future<PeriodResult> skip(InstanceSkip change, CommandId commandId);
  Future<DeductionConfirmationResult> confirm(
    DeductionConfirmation change,
    CommandId commandId,
  );
  Future<DeductionFailureResult> reportFailure(
    DeductionFailure change,
    CommandId commandId,
  );
}
