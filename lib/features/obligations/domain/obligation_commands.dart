import '../../../core/dates/local_date.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/money.dart';
import 'obligation.dart';

final class ObligationDraft {
  const ObligationDraft({
    required this.title,
    required this.description,
    required this.notes,
    required this.direction,
    required this.amount,
    required this.originationDate,
    required this.dueDate,
    required this.contactId,
    required this.categoryId,
    required this.paymentSourceId,
    required this.interestInfo,
  });
  final String title, description, notes;
  final ObligationDirection direction;
  final Money amount;
  final LocalDate originationDate;
  final LocalDate? dueDate;
  final ContactId? contactId;
  final CategoryId categoryId;
  final SourceId? paymentSourceId;
  final InterestInfo? interestInfo;
  Map<String, Object?> toPayload() => {
    'title': title,
    'description': description,
    'notes': notes,
    'direction': direction.name,
    'currency': amount.currency.code,
    'amountMinor': amount.minorUnits,
    'originationDate': originationDate.toString(),
    'dueDate': dueDate?.toString(),
    'contactId': contactId?.value,
    'categoryId': categoryId.value,
    'paymentSourceId': paymentSourceId?.value,
    'interestInfo': interestInfo?.toPayload(),
  };
}

final class ObligationResult {
  const ObligationResult({
    required this.id,
    required this.instanceId,
    required this.obligationRevision,
    required this.instanceRevision,
  });
  final ObligationId id;
  final InstanceId instanceId;
  final int obligationRevision, instanceRevision;
}
