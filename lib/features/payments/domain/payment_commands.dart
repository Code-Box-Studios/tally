import '../../../core/dates/local_date.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/money.dart';
import 'payment_entry.dart';
import '../../../shared/domain/instance_revision.dart';
import '../../../core/errors/app_failure.dart';

final class PaymentTerms {
  const PaymentTerms({
    required this.amount,
    required this.date,
    required this.sourceId,
    required this.method,
    this.notes = '',
  });
  final Money amount;
  final LocalDate date;
  final SourceId? sourceId;
  final PaymentMethod method;
  final String notes;
  Map<String, Object?> toPayload() => {
    'amountMinor': amount.minorUnits,
    'paymentDate': date.toString(),
    'paymentSourceId': sourceId?.value,
    'paymentMethod': method.name,
    'notes': notes,
  };
}

final class PaymentDraft {
  const PaymentDraft({
    required this.obligationId,
    required this.instanceId,
    required this.terms,
  });
  final ObligationId obligationId;
  final InstanceId instanceId;
  final PaymentTerms terms;
  Map<String, Object?> toPayload() => {
    ...terms.toPayload(),
    'obligationId': obligationId.value,
    'obligationInstanceId': instanceId.value,
    'currency': terms.amount.currency.code,
  };
}

final class PaymentCorrection {
  const PaymentCorrection({
    required this.paymentId,
    required this.reason,
    this.replacement,
    this.expectedObligationRevision,
  });
  final PaymentId paymentId;
  final String reason;
  final PaymentTerms? replacement;
  final int? expectedObligationRevision;
  Map<String, Object?> toPayload() => {
    'paymentId': paymentId.value,
    'reason': reason,
    'replacement': replacement?.toPayload(),
    if (expectedObligationRevision != null)
      'expectedObligationRevision': expectedObligationRevision,
  };
}

final class InstallmentPaymentDraft {
  InstallmentPaymentDraft({
    required this.obligationId,
    required this.terms,
    List<PaymentAllocation>? explicitAllocations,
  }) : explicitAllocations = explicitAllocations == null
           ? null
           : List.unmodifiable(explicitAllocations) {
    final allocations = this.explicitAllocations;
    if (allocations != null) {
      if (allocations.isEmpty ||
          allocations.length > 24 ||
          allocations.map((a) => a.instanceId).toSet().length !=
              allocations.length) {
        throw AppFailure(
          AppFailureCode.invalidAmount,
          messageKey: 'payments.invalidAllocations',
        );
      }
      var sum = Money.fromMinorUnits(0, terms.amount.currency);
      for (final a in allocations) {
        if (a.amount.minorUnits < 1) {
          throw AppFailure(
            AppFailureCode.invalidAmount,
            messageKey: 'payments.invalidAllocations',
          );
        }
        sum = sum.add(a.amount);
      }
      if (sum != terms.amount) {
        throw AppFailure(
          AppFailureCode.invalidAmount,
          messageKey: 'payments.invalidAllocations',
        );
      }
    }
  }
  final ObligationId obligationId;
  final PaymentTerms terms;
  final List<PaymentAllocation>? explicitAllocations;
  Map<String, Object?> toPayload() => {
    ...terms.toPayload(),
    'obligationId': obligationId.value,
    'currency': terms.amount.currency.code,
    'explicitAllocations': explicitAllocations
        ?.map(
          (a) => {
            'instanceId': a.instanceId.value,
            'amountMinor': a.amount.minorUnits,
          },
        )
        .toList(),
  };
}

final class PaymentResult {
  PaymentResult(
    this.paymentId,
    this.obligationId,
    this.instanceId,
    this.obligationRevision,
    this.instanceRevision, {
    List<InstanceRevision> allocationRevisions = const [],
  }) : allocationRevisions = List.unmodifiable(allocationRevisions);
  final PaymentId paymentId;
  final ObligationId obligationId;
  final InstanceId? instanceId;
  final int obligationRevision;
  final int? instanceRevision;
  final List<InstanceRevision> allocationRevisions;
}

final class CorrectionResult {
  CorrectionResult(
    this.originalId,
    this.reversalId,
    this.replacementId,
    this.obligationId,
    this.instanceId,
    this.obligationRevision,
    this.instanceRevision, {
    List<InstanceRevision> allocationRevisions = const [],
  }) : allocationRevisions = List.unmodifiable(allocationRevisions);
  final PaymentId originalId, reversalId;
  final PaymentId? replacementId;
  final ObligationId obligationId;
  final InstanceId? instanceId;
  final int obligationRevision;
  final int? instanceRevision;
  final List<InstanceRevision> allocationRevisions;
}
