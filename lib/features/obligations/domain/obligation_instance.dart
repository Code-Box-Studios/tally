import '../../../core/dates/local_date.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../../../core/money/money.dart';
import 'obligation.dart';
import '../../recurring/domain/deduction_attempt.dart';
import '../../../shared/domain/catalog.dart';

final class ObligationInstance {
  const ObligationInstance({
    required this.id,
    required this.obligationId,
    required this.owner,
    required this.title,
    required this.currency,
    required this.amount,
    required this.paidAmount,
    required this.remainingAmount,
    required this.dueDate,
    required this.occurrenceDate,
    required this.timezone,
    required this.direction,
    required this.section,
    required this.status,
    required this.paymentMode,
    required this.paymentSourceId,
    required this.contactId,
    required this.categoryId,
    required this.periodLabel,
    required this.closed,
    required this.revision,
    this.hasPaymentHistory,
    this.deductionStatus = DeductionStatus.none,
    this.deductionAt,
    this.deductionDate,
    this.localDeductionTime,
    this.requiresDeductionConfirmation = false,
    this.estimatedAmount,
    this.source,
    this.notes = '',
    this.description = '',
    this.contact,
    this.categoryName = '',
  });
  final InstanceId id;
  final ObligationId obligationId;
  final OwnerUid owner;
  final String title;
  final CurrencyCode currency;
  final Money? amount, remainingAmount;
  final Money paidAmount;
  final LocalDate? dueDate;
  final LocalDate occurrenceDate;
  final String timezone;
  final ObligationDirection direction;
  final ObligationSection section;
  final FinancialStatus status;
  final PaymentMode paymentMode;
  final SourceId? paymentSourceId;
  final ContactId? contactId;
  final CategoryId categoryId;
  final String periodLabel;
  final bool closed;
  final int revision;
  final bool? hasPaymentHistory;
  final DeductionStatus deductionStatus;
  final DateTime? deductionAt;
  final LocalDate? deductionDate;
  final String? localDeductionTime;
  final bool requiresDeductionConfirmation;
  final Money? estimatedAmount;
  final SourceLabel? source;
  final String notes;
  final String description, categoryName;
  final ContactLabel? contact;
}
