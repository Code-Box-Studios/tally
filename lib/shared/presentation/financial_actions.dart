import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/identifiers/command_id_factory.dart';
import '../../core/identifiers/entity_ids.dart';
import '../../features/auth/presentation/auth_providers.dart';
import '../../features/obligations/domain/obligation_commands.dart';
import '../../features/obligations/domain/installment_commands.dart';
import '../../features/payments/domain/payment_commands.dart';
import '../data/financial_failure_mapper.dart';
import '../domain/catalog.dart';
import 'financial_providers.dart';

final financialActionsProvider = AsyncNotifierProvider<FinancialActions, void>(
  FinancialActions.new,
  dependencies: [
    ownerUidProvider,
    obligationsRepositoryProvider,
    paymentsRepositoryProvider,
    catalogRepositoryProvider,
  ],
);

class FinancialActions extends AsyncNotifier<void> {
  final _attempts = <String, CommandId>{};
  late OwnerUid _owner;
  @override
  void build() {
    _owner = ref.watch(ownerUidProvider);
  }

  Future<T?> _run<T>(
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
      return result;
    } catch (error, stack) {
      if (ref.mounted) state = AsyncError(financialFailure(error), stack);
      return null;
    }
  }

  Future<InstallmentResult?> createInstallment(InstallmentDraft draft) => _run(
    'createInstallment',
    draft.toPayload(),
    (id) =>
        ref.read(obligationsRepositoryProvider).createInstallment(draft, id),
  );
  Future<InstallmentResult?> editInstallment(
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
  Future<InstallmentResult?> cancelInstallment(
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
  Future<PaymentResult?> recordInstallmentPayment(
    InstallmentPaymentDraft draft,
  ) => _run(
    'recordInstallmentPayment',
    draft.toPayload(),
    (id) => ref.read(paymentsRepositoryProvider).recordInstallment(draft, id),
  );
  Future<ObligationResult?> createObligation(ObligationDraft draft) => _run(
    'createObligation',
    draft.toPayload(),
    (id) => ref.read(obligationsRepositoryProvider).create(draft, id),
  );
  Future<ObligationResult?> editObligation(
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
  Future<ObligationResult?> cancelObligation(
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
  Future<PaymentResult?> recordPayment(PaymentDraft draft) => _run(
    'recordPayment',
    draft.toPayload(),
    (id) => ref.read(paymentsRepositoryProvider).record(draft, id),
  );
  Future<CorrectionResult?> correctPayment(PaymentCorrection correction) =>
      _run(
        'correctPayment',
        correction.toPayload(),
        (id) => ref.read(paymentsRepositoryProvider).correct(correction, id),
      );
  Future<CatalogResult<ContactId>?> saveContact(
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
  Future<CatalogResult<SourceId>?> saveSource(
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
  Future<CatalogResult<CategoryId>?> saveCategory(
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
