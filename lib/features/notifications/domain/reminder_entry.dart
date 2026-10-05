import '../../../core/dates/local_date.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../../../core/money/money.dart';

enum ReminderKind {
  upcoming,
  dueToday,
  overdue,
  automaticUpcoming,
  automaticConfirmation,
  owedToMe,
}

enum ReminderPhase { upcoming, due, overdue, confirmation }

enum ReminderStatus { pending, sent, cancelled, failed }

final class ReminderEntry {
  const ReminderEntry({
    required this.id,
    required this.owner,
    required this.obligationId,
    required this.instanceId,
    required this.kind,
    required this.phase,
    required this.civilTargetDate,
    required this.scheduledAt,
    required this.savedTimezone,
    required this.quietTimezone,
    required this.preferenceRevision,
    required this.policyRevision,
    required this.status,
    required this.readAt,
    required this.revision,
    required this.title,
    required this.amount,
    required this.currency,
    required this.visibleAt,
  });
  final String id;
  final OwnerUid owner;
  final ObligationId obligationId;
  final InstanceId instanceId;
  final ReminderKind kind;
  final ReminderPhase phase;
  final LocalDate civilTargetDate;
  final DateTime scheduledAt;
  final String savedTimezone, quietTimezone;
  final int preferenceRevision, policyRevision, revision;
  final ReminderStatus status;
  final DateTime? readAt, visibleAt;
  final String title;
  final Money? amount;
  final CurrencyCode currency;
}
