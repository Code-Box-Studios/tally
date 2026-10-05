import '../../../core/dates/local_date.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../../../core/money/money.dart';
import '../../obligations/domain/obligation.dart';
import '../../payments/domain/payment_commands.dart';
import 'recurrence_rule.dart';
import 'recurring_schedule.dart';
export 'recurring_schedule.dart' show ReminderPolicy;

final class RecurringDraft {
  RecurringDraft({
    required this.title,
    required this.description,
    required this.notes,
    required this.currency,
    required this.amountKind,
    required this.defaultAmount,
    required this.paymentMode,
    required this.contactId,
    required this.categoryId,
    required this.paymentSourceId,
    required this.recurrence,
    required this.reminderPolicy,
  }) {
    if (title.trim().isEmpty ||
        title.length > 120 ||
        description.length > 1000 ||
        notes.length > 4000 ||
        defaultAmount != null &&
            (defaultAmount!.currency != currency ||
                defaultAmount!.minorUnits <= 0) ||
        amountKind == AmountKind.fixed && defaultAmount == null) {
      throw ArgumentError('Check the bill name and amount.');
    }
  }
  final String title, description, notes;
  final CurrencyCode currency;
  final AmountKind amountKind;
  final Money? defaultAmount;
  final PaymentMode paymentMode;
  final ContactId? contactId;
  final CategoryId categoryId;
  final SourceId? paymentSourceId;
  final RecurrenceRule recurrence;
  final ReminderPolicy reminderPolicy;
  Map<String, Object?> toPayload() => {
    'title': title,
    'description': description,
    'notes': notes,
    'contactId': contactId?.value,
    'categoryId': categoryId.value,
    'currency': currency.code,
    'amountKind': amountKind.name,
    'defaultAmountMinor': defaultAmount?.minorUnits,
    'paymentMode': paymentMode.name,
    'paymentSourceId': paymentSourceId?.value,
    'recurrence': recurrence.toMap(),
    'reminderPolicy': reminderPolicy.toPayload(),
  };
}

final class RecurringEdit {
  const RecurringEdit({
    required this.obligationId,
    required this.expectedRevision,
    required this.draft,
  });
  final ObligationId obligationId;
  final int expectedRevision;
  final RecurringDraft draft;
  Map<String, Object?> toPayload() => {
    ...draft.toPayload(),
    'obligationId': obligationId.value,
    'expectedRevision': expectedRevision,
  };
}

enum RecurringLifecycleAction { pause, resume, end }

final class LifecycleChange {
  const LifecycleChange({
    required this.obligationId,
    required this.expectedRevision,
    required this.action,
    required this.effectiveDate,
  });
  final ObligationId obligationId;
  final int expectedRevision;
  final RecurringLifecycleAction action;
  final LocalDate effectiveDate;
  Map<String, Object?> toPayload() => {
    'obligationId': obligationId.value,
    'expectedRevision': expectedRevision,
    'action': action.name,
    'effectiveDate': effectiveDate.toString(),
  };
}

final class InstanceAmountEdit {
  const InstanceAmountEdit({
    required this.obligationId,
    required this.instanceId,
    required this.expectedRevision,
    required this.amount,
    required this.reason,
  });
  final ObligationId obligationId;
  final InstanceId instanceId;
  final int expectedRevision;
  final Money amount;
  final String reason;
  Map<String, Object?> toPayload() => {
    'obligationId': obligationId.value,
    'instanceId': instanceId.value,
    'expectedRevision': expectedRevision,
    'amountMinor': amount.minorUnits,
    'reason': reason,
  };
}

final class RecurringInstanceEdit {
  const RecurringInstanceEdit({
    required this.obligationId,
    required this.instanceId,
    required this.expectedRevision,
    required this.dueDate,
    required this.paymentSourceId,
    required this.notes,
    required this.reason,
  });
  final ObligationId obligationId;
  final InstanceId instanceId;
  final int expectedRevision;
  final LocalDate dueDate;
  final SourceId? paymentSourceId;
  final String notes, reason;
  Map<String, Object?> toPayload() => {
    'obligationId': obligationId.value,
    'instanceId': instanceId.value,
    'expectedRevision': expectedRevision,
    'dueDate': dueDate.toString(),
    'paymentSourceId': paymentSourceId?.value,
    'notes': notes,
    'reason': reason,
  };
}

final class InstanceSkip {
  const InstanceSkip({
    required this.obligationId,
    required this.instanceId,
    required this.expectedRevision,
    required this.reason,
  });
  final ObligationId obligationId;
  final InstanceId instanceId;
  final int expectedRevision;
  final String reason;
  Map<String, Object?> toPayload() => {
    'obligationId': obligationId.value,
    'instanceId': instanceId.value,
    'expectedRevision': expectedRevision,
    'reason': reason,
  };
}

final class DeductionConfirmation {
  const DeductionConfirmation({
    required this.obligationId,
    required this.instanceId,
    required this.expectedRevision,
    required this.terms,
  });
  final ObligationId obligationId;
  final InstanceId instanceId;
  final int expectedRevision;
  final PaymentTerms terms;
  Map<String, Object?> toPayload() => {
    'obligationId': obligationId.value,
    'instanceId': instanceId.value,
    'expectedRevision': expectedRevision,
    ...terms.toPayload(),
  };
}

final class DeductionFailure {
  const DeductionFailure({
    required this.obligationId,
    required this.instanceId,
    required this.expectedRevision,
    required this.reason,
  });
  final ObligationId obligationId;
  final InstanceId instanceId;
  final int expectedRevision;
  final String reason;
  Map<String, Object?> toPayload() => {
    'obligationId': obligationId.value,
    'instanceId': instanceId.value,
    'expectedRevision': expectedRevision,
    'reason': reason,
  };
}

final class RecurringResult {
  const RecurringResult({
    required this.obligationId,
    required this.obligationRevision,
    required this.generationRevision,
    this.firstInstanceId,
    this.appliesAfter,
    this.retainedFutureCount,
  });
  final ObligationId obligationId;
  final int obligationRevision, generationRevision;
  final InstanceId? firstInstanceId;
  final LocalDate? appliesAfter;
  final int? retainedFutureCount;
}

final class PeriodResult {
  const PeriodResult(this.obligationId, this.instanceId, this.instanceRevision);
  final ObligationId obligationId;
  final InstanceId instanceId;
  final int instanceRevision;
}

final class DeductionConfirmationResult {
  const DeductionConfirmationResult({
    required this.obligationId,
    required this.instanceId,
    required this.obligationRevision,
    required this.instanceRevision,
    required this.paymentId,
    required this.evidenceId,
  });
  final ObligationId obligationId;
  final InstanceId instanceId;
  final int obligationRevision, instanceRevision;
  final PaymentId paymentId;
  final PaymentEvidenceId? evidenceId;
}

final class DeductionFailureResult {
  const DeductionFailureResult({
    required this.obligationId,
    required this.instanceId,
    required this.obligationRevision,
    required this.instanceRevision,
    required this.reversalId,
    required this.attemptId,
  });
  final ObligationId obligationId;
  final InstanceId instanceId;
  final int obligationRevision, instanceRevision;
  final PaymentId? reversalId;
  final DeductionAttemptId attemptId;
}
