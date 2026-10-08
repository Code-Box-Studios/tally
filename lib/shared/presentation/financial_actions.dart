import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/identifiers/command_id_factory.dart';
import '../../core/identifiers/entity_ids.dart';
import '../../features/auth/presentation/auth_providers.dart';
import '../../features/obligations/domain/obligation_commands.dart';
import '../../features/obligations/domain/installment_commands.dart';
import '../../features/payments/domain/payment_commands.dart';
import '../data/financial_failure_mapper.dart';
import '../domain/financial_failure.dart';
import '../../features/sync/domain/command_submission.dart';
import '../../features/sync/data/local_outbox_failure.dart';
import '../domain/catalog.dart';
import 'financial_providers.dart';
import '../../features/recurring/domain/recurring_commands.dart';
import '../../features/recurring/presentation/recurring_providers.dart';

final financialActionsProvider = AsyncNotifierProvider<FinancialActions, void>(
  FinancialActions.new,
  dependencies: [
    ownerUidProvider,
    obligationsRepositoryProvider,
    paymentsRepositoryProvider,
    catalogRepositoryProvider,
    recurringRepositoryProvider,
  ],
);

class FinancialActions extends AsyncNotifier<void> {
  final _attempts = <String, CommandId>{};
  late OwnerUid _owner;
  @override
  void build() {
    _owner = ref.watch(ownerUidProvider);
  }

  Future<CommandSubmission<T>?> _run<T>(
    String name,
    Map<String, Object?> payload,
    Future<T> Function(CommandId) operation,
  ) async {
    if (state.isLoading) return null;
    final fingerprint = jsonEncode([_owner.value, name, payload]);
    final id = _attempts.putIfAbsent(fingerprint, newCommandId);
    state = const AsyncLoading();
    try {
      final result = await operation(id);
      if (!ref.mounted) return null;
      _attempts.remove(fingerprint);
      state = const AsyncData(null);
      return AcceptedSubmission(result);
    } on QueuedCommand catch (queued) {
      if (!ref.mounted || queued.owner != _owner) return null;
      state = const AsyncData(null);
      return QueuedSubmission(_owner, queued.commandId);
    } catch (error, stack) {
      if (!ref.mounted) return null;
      final failure = error is LocalOutboxFailure
          ? error
          : financialFailure(error);
      if (failure is FinancialFailure &&
          const {
            FinancialFailureCode.conflict,
            FinancialFailureCode.invalid,
            FinancialFailureCode.overpayment,
            FinancialFailureCode.recovery,
          }.contains(failure.code)) {
        _attempts.remove(fingerprint);
      }
      state = AsyncError(failure, stack);
      return null;
    }
  }

  Future<CommandSubmission<InstallmentResult>?> createInstallment(
    InstallmentDraft draft,
  ) => _run(
    'createInstallment',
    draft.toPayload(),
    (id) =>
        ref.read(obligationsRepositoryProvider).createInstallment(draft, id),
  );
  Future<CommandSubmission<RecurringResult>?> createRecurring(
    RecurringDraft draft,
  ) => _run(
    'createRecurring',
    draft.toPayload(),
    (id) => ref.read(recurringRepositoryProvider).create(draft, id),
  );
  Future<CommandSubmission<RecurringResult>?> editRecurring(
    RecurringEdit change,
  ) => _run(
    'editRecurring',
    change.toPayload(),
    (id) => ref.read(recurringRepositoryProvider).edit(change, id),
  );
  Future<CommandSubmission<RecurringResult>?> changeRecurringLifecycle(
    LifecycleChange change,
  ) => _run(
    'changeRecurringLifecycle',
    change.toPayload(),
    (id) => ref.read(recurringRepositoryProvider).changeLifecycle(change, id),
  );
  Future<CommandSubmission<PeriodResult>?> setRecurringAmount(
    InstanceAmountEdit change,
  ) => _run(
    'setRecurringAmount',
    change.toPayload(),
    (id) => ref.read(recurringRepositoryProvider).setAmount(change, id),
  );
  Future<CommandSubmission<PeriodResult>?> editRecurringInstance(
    RecurringInstanceEdit change,
  ) => _run(
    'editRecurringInstance',
    change.toPayload(),
    (id) => ref.read(recurringRepositoryProvider).editPeriod(change, id),
  );
  Future<CommandSubmission<PeriodResult>?> skipRecurringInstance(
    InstanceSkip change,
  ) => _run(
    'skipRecurringInstance',
    change.toPayload(),
    (id) => ref.read(recurringRepositoryProvider).skip(change, id),
  );
  Future<CommandSubmission<DeductionConfirmationResult>?> confirmDeduction(
    DeductionConfirmation change,
  ) => _run(
    'confirmDeduction',
    change.toPayload(),
    (id) => ref.read(recurringRepositoryProvider).confirm(change, id),
  );
  Future<CommandSubmission<DeductionFailureResult>?> reportDeductionFailure(
    DeductionFailure change,
  ) => _run(
    'reportDeductionFailure',
    change.toPayload(),
    (id) => ref.read(recurringRepositoryProvider).reportFailure(change, id),
  );
  Future<CommandSubmission<InstallmentResult>?> editInstallment(
    ObligationId obligationId,
    int revision,
    InstallmentDraft draft,
  ) => _run(
    'editInstallment',
    {
      ...draft.toPayload(),
      'obligationId': obligationId.value,
      'expectedRevision': revision,
    },
    (id) => ref
        .read(obligationsRepositoryProvider)
        .editInstallment(obligationId, revision, draft, id),
  );
  Future<CommandSubmission<InstallmentResult>?> cancelInstallment(
    ObligationId obligationId,
    int revision,
    String reason,
  ) => _run(
    'cancelInstallment',
    {
      'obligationId': obligationId.value,
      'expectedRevision': revision,
      'reason': reason,
    },
    (id) => ref
        .read(obligationsRepositoryProvider)
        .cancelInstallment(obligationId, revision, reason, id),
  );
  Future<CommandSubmission<PaymentResult>?> recordInstallmentPayment(
    InstallmentPaymentDraft draft,
  ) => _run(
    'recordInstallmentPayment',
    draft.toPayload(),
    (id) => ref.read(paymentsRepositoryProvider).recordInstallment(draft, id),
  );
  Future<CommandSubmission<ObligationResult>?> createObligation(
    ObligationDraft draft,
  ) => _run(
    'createObligation',
    draft.toPayload(),
    (id) => ref.read(obligationsRepositoryProvider).create(draft, id),
  );
  Future<CommandSubmission<ObligationResult>?> editObligation(
    ObligationId obligationId,
    int revision,
    ObligationDraft draft,
  ) => _run(
    'editObligation',
    {
      ...draft.toPayload(),
      'obligationId': obligationId.value,
      'expectedRevision': revision,
    },
    (id) => ref
        .read(obligationsRepositoryProvider)
        .edit(obligationId, revision, draft, id),
  );
  Future<CommandSubmission<ObligationResult>?> cancelObligation(
    ObligationId obligationId,
    int revision,
    String reason,
  ) => _run(
    'cancelObligation',
    {
      'obligationId': obligationId.value,
      'expectedRevision': revision,
      'reason': reason,
    },
    (id) => ref
        .read(obligationsRepositoryProvider)
        .cancel(obligationId, revision, reason, id),
  );
  Future<CommandSubmission<PaymentResult>?> recordPayment(PaymentDraft draft) =>
      _run(
        'recordPayment',
        draft.toPayload(),
        (id) => ref.read(paymentsRepositoryProvider).record(draft, id),
      );
  Future<CommandSubmission<CorrectionResult>?> correctPayment(
    PaymentCorrection correction,
  ) => _run(
    'correctPayment',
    correction.toPayload(),
    (id) => ref.read(paymentsRepositoryProvider).correct(correction, id),
  );
  Future<CommandSubmission<CatalogResult<ContactId>>?> saveContact(
    ContactDraft draft, {
    ContactId? id,
    int? revision,
  }) => _run(
    'saveContact',
    {...draft.toPayload(), 'id': id?.value, 'revision': revision},
    (command) => ref
        .read(catalogRepositoryProvider)
        .saveContact(draft, command, id: id, expectedRevision: revision),
  );
  Future<CommandSubmission<CatalogResult<SourceId>>?> saveSource(
    SourceDraft draft, {
    SourceId? id,
    int? revision,
  }) => _run(
    'saveSource',
    {...draft.toPayload(), 'id': id?.value, 'revision': revision},
    (command) => ref
        .read(catalogRepositoryProvider)
        .saveSource(draft, command, id: id, expectedRevision: revision),
  );
  Future<CommandSubmission<CatalogResult<CategoryId>>?> saveCategory(
    CategoryDraft draft, {
    CategoryId? id,
    int? revision,
  }) => _run(
    'saveCategory',
    {...draft.toPayload(), 'id': id?.value, 'revision': revision},
    (command) => ref
        .read(catalogRepositoryProvider)
        .saveCategory(draft, command, id: id, expectedRevision: revision),
  );
}
