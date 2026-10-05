import '../../../core/dates/local_date.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../../../core/money/money.dart';
import '../../../shared/domain/catalog.dart';

enum DeductionStatus {
  none,
  scheduled,
  expected,
  deducted,
  confirmed,
  failed,
  resolved;

  String get label => switch (this) {
    none => 'Manual payment',
    scheduled => 'Scheduled deduction',
    expected => 'Awaiting confirmation',
    deducted => 'Assumed deducted',
    confirmed => 'Confirmed',
    failed => 'Automatic deduction failed',
    resolved => 'Paid manually',
  };
}

enum DeductionAttemptType {
  assumed,
  expected,
  suppressed,
  confirmed,
  failed,
  manualResolved,
  corrected,
}

enum DeductionActor { system, user }

final class DeductionAttempt {
  const DeductionAttempt({
    required this.id,
    required this.owner,
    required this.obligationId,
    required this.instanceId,
    required this.eventKey,
    required this.type,
    required this.currency,
    required this.amount,
    required this.paymentId,
    required this.reason,
    required this.sourceId,
    required this.source,
    required this.scheduledDate,
    required this.timezone,
    required this.processedAt,
    required this.actor,
  });
  final DeductionAttemptId id;
  final OwnerUid owner;
  final ObligationId obligationId;
  final InstanceId instanceId;
  final String eventKey, timezone;
  final DeductionAttemptType type;
  final CurrencyCode currency;
  final Money? amount;
  final PaymentId? paymentId;
  final String? reason;
  final SourceId? sourceId;
  final SourceLabel? source;
  final LocalDate? scheduledDate;
  final DateTime processedAt;
  final DeductionActor actor;
}

final class PaymentEvidence {
  const PaymentEvidence({
    required this.id,
    required this.owner,
    required this.obligationId,
    required this.instanceId,
    required this.paymentId,
    required this.notes,
    required this.recordedAt,
  });
  final PaymentEvidenceId id;
  final OwnerUid owner;
  final ObligationId obligationId;
  final InstanceId instanceId;
  final PaymentId paymentId;
  final String notes;
  final DateTime recordedAt;
}
