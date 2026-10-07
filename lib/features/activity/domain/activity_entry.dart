import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/money.dart';
import '../../obligations/domain/obligation.dart';

enum ActivityType {
  obligationCreated,
  obligationChanged,
  obligationCancelled,
  obligationCompleted,
  paymentMade,
  paymentReceived,
  paymentCorrected,
  aggregateRepaired,
  contactChanged,
  sourceChanged,
  categoryChanged,
  automaticPaymentRecorded,
  automaticPaymentFailed,
  automaticPaymentExpected,
  automaticPaymentConfirmed,
  periodsGenerated,
  periodChanged,
  periodAmountChanged,
  periodSkipped,
  recurringPaused,
  recurringResumed,
  recurringEnded,
  reminderGenerated,
  attachmentAdded,
  attachmentReady,
  attachmentRemoved,
  unknown;

  String get label => switch (this) {
    obligationCreated => 'Obligation added',
    obligationChanged => 'Obligation updated',
    obligationCancelled => 'Obligation cancelled',
    obligationCompleted => 'Obligation completed',
    paymentMade => 'Payment recorded',
    paymentReceived => 'Repayment received',
    paymentCorrected => 'Payment corrected',
    aggregateRepaired => 'Balances recalculated',
    contactChanged => 'Contact updated',
    sourceChanged => 'Payment source updated',
    categoryChanged => 'Category updated',
    automaticPaymentRecorded => 'Automatic deduction recorded',
    automaticPaymentFailed => 'Automatic deduction failed',
    automaticPaymentExpected => 'Automatic deduction expected',
    automaticPaymentConfirmed => 'Automatic deduction confirmed',
    periodsGenerated => 'Billing periods added',
    periodChanged => 'Billing period updated',
    periodAmountChanged => 'Bill amount updated',
    periodSkipped => 'Billing period skipped',
    recurringPaused => 'Recurring bill paused',
    recurringResumed => 'Recurring bill resumed',
    recurringEnded => 'Recurring bill ended',
    reminderGenerated => 'Reminder created',
    attachmentAdded => 'File added',
    attachmentReady => 'File ready',
    attachmentRemoved => 'File removed',
    unknown => 'Activity recorded',
  };
}

final class ActivityEntry {
  const ActivityEntry({
    required this.id,
    required this.owner,
    required this.type,
    required this.title,
    required this.amount,
    required this.obligationId,
    required this.paymentId,
    required this.direction,
    required this.reason,
    required this.createdAt,
    required this.recordedAt,
  });
  final ActivityId id;
  final OwnerUid owner;
  final ActivityType type;
  final String title;
  final Money? amount;
  final ObligationId? obligationId;
  final PaymentId? paymentId;
  final ObligationDirection? direction;
  final String? reason;
  final DateTime createdAt, recordedAt;
}
