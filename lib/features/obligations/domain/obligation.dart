import '../../../core/identifiers/entity_ids.dart';
import '../../../core/dates/local_date.dart';
import '../../../core/money/money.dart';
import '../../../core/money/currency_code.dart';
import '../../../shared/domain/catalog.dart';

enum ObligationType {
  owedByMe,
  owedToMe,
  recurringDue,
  installment,
  subscription,
}

enum ObligationDirection { owedByMe, owedToMe }

enum ObligationSection { iOwe, owedToMe, monthlyDues }

enum ObligationLifecycle { active, paused, ended, cancelled }

enum FinancialStatus {
  active,
  pending,
  partiallyPaid,
  paid,
  overdue,
  skipped,
  cancelled,
  upcoming,
  scheduled,
  expected,
  deducted,
  failed,
}

enum PaymentMode { manual, automatic, automaticConfirmation }

enum AmountKind { fixed, variable }

final class InterestInfo {
  const InterestInfo({
    required this.rateBasisPoints,
    required this.basis,
    required this.notes,
  });
  final int rateBasisPoints;
  final String basis, notes;
  Map<String, Object?> toPayload() => {
    'rateBasisPoints': rateBasisPoints,
    'basis': basis,
    'agreementNotes': notes,
  };
}

final class Obligation {
  Obligation({
    required this.id,
    required this.owner,
    required this.type,
    required this.direction,
    required this.section,
    required this.title,
    required this.description,
    required this.notes,
    required this.currency,
    required this.originalAmount,
    required this.paidAmount,
    required this.remainingAmount,
    required this.defaultAmount,
    required this.amountKind,
    required this.originationDate,
    required this.timezone,
    required this.dueDate,
    required this.nextDueDate,
    required this.lifecycle,
    required this.status,
    required this.paymentMode,
    required this.contactId,
    required this.contact,
    required this.categoryId,
    required this.categoryName,
    required this.paymentSourceId,
    required this.source,
    required this.singleInstanceId,
    required this.interestInfo,
    required this.archived,
    required this.hasPaymentHistory,
    required this.revision,
    required this.createdAt,
    List<InstanceId> installmentInstanceIds = const [],
  }) : installmentInstanceIds = List.unmodifiable(installmentInstanceIds);
  final ObligationId id;
  final OwnerUid owner;
  final ObligationType type;
  final ObligationDirection direction;
  final ObligationSection section;
  final String title, description, notes;
  final CurrencyCode currency;
  final Money? originalAmount, paidAmount, remainingAmount, defaultAmount;
  final AmountKind amountKind;
  final LocalDate originationDate;
  final String timezone;
  final LocalDate? dueDate, nextDueDate;
  final ObligationLifecycle lifecycle;
  final FinancialStatus status;
  final PaymentMode paymentMode;
  final ContactId? contactId;
  final ContactLabel? contact;
  final CategoryId categoryId;
  final String categoryName;
  final SourceId? paymentSourceId;
  final SourceLabel? source;
  final InstanceId? singleInstanceId;
  final List<InstanceId> installmentInstanceIds;
  final InterestInfo? interestInfo;
  final bool archived, hasPaymentHistory;
  final int revision;
  final DateTime createdAt;
  bool get isRecurring =>
      type == ObligationType.recurringDue ||
      type == ObligationType.subscription;
  bool get isOutstanding =>
      lifecycle == ObligationLifecycle.active &&
      (isRecurring || (remainingAmount?.minorUnits ?? 0) > 0);
}
