import '../../../core/dates/local_date.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/money.dart';
import 'payment_entry.dart';

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
  });
  final PaymentId paymentId;
  final String reason;
  final PaymentTerms? replacement;
  Map<String, Object?> toPayload() => {
    'paymentId': paymentId.value,
    'reason': reason,
    'replacement': replacement?.toPayload(),
  };
}

final class PaymentResult {
  const PaymentResult(
    this.paymentId,
    this.obligationId,
    this.instanceId,
    this.obligationRevision,
    this.instanceRevision,
  );
  final PaymentId paymentId;
  final ObligationId obligationId;
  final InstanceId instanceId;
  final int obligationRevision, instanceRevision;
}

final class CorrectionResult {
  const CorrectionResult(
    this.originalId,
    this.reversalId,
    this.replacementId,
    this.obligationId,
    this.instanceId,
    this.obligationRevision,
    this.instanceRevision,
  );
  final PaymentId originalId, reversalId;
  final PaymentId? replacementId;
  final ObligationId obligationId;
  final InstanceId instanceId;
  final int obligationRevision, instanceRevision;
}
