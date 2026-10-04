import '../../../core/dates/local_date.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/money.dart';
import '../../../shared/domain/catalog.dart';
import '../../obligations/domain/obligation.dart';

enum PaymentEntryType { payment, reversal }

enum PaymentMethod { cash, bankTransfer, card, eWallet, payroll, other }

enum PaymentProvenance { manual, assumedAutomatic, confirmedAutomatic }

final class PaymentAllocation {
  const PaymentAllocation(this.instanceId, this.amount);
  final InstanceId instanceId;
  final Money amount;
}

final class PaymentEntry {
  PaymentEntry({
    required this.id,
    required this.owner,
    required this.obligationId,
    required this.instanceId,
    required Iterable<PaymentAllocation> allocations,
    required this.type,
    required this.amount,
    required this.date,
    required this.timezone,
    required this.sourceId,
    required this.source,
    required this.method,
    required this.provenance,
    required this.direction,
    required this.contactId,
    required this.categoryId,
    required this.notes,
    required this.commandId,
    required this.reversesPaymentId,
    required this.correctionGroupId,
    required this.correctionReason,
    required this.createdAt,
    required this.recordedAt,
  }) : allocations = List.unmodifiable(allocations);
  final PaymentId id;
  final OwnerUid owner;
  final ObligationId obligationId;
  final InstanceId? instanceId;
  final List<PaymentAllocation> allocations;
  final PaymentEntryType type;
  final Money amount;
  final LocalDate date;
  final String timezone;
  final SourceId? sourceId;
  final SourceLabel? source;
  final PaymentMethod method;
  final PaymentProvenance provenance;
  final ObligationDirection direction;
  final ContactId? contactId;
  final CategoryId categoryId;
  final String notes;
  final CommandId commandId;
  final PaymentId? reversesPaymentId;
  final String? correctionGroupId, correctionReason;
  final DateTime createdAt, recordedAt;
}
