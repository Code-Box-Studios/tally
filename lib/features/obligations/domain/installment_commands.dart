import '../../../core/errors/app_failure.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/instance_revision.dart';
import 'obligation_commands.dart';
import 'installment_schedule.dart';

final class InstallmentDraft {
  InstallmentDraft(this.obligation, this.schedule) {
    if (obligation.amount != schedule.principal ||
        obligation.originationDate != schedule.originationDate) {
      throw AppFailure(
        AppFailureCode.invalidAmount,
        messageKey: 'installments.invalidSchedule',
      );
    }
  }
  final ObligationDraft obligation;
  final InstallmentSchedule schedule;
  Map<String, Object?> toPayload() => {
    ...obligation.toPayload(),
    'dueDate': schedule.maturity.toString(),
    'installments': schedule.terms.map((term) => term.toPayload()).toList(),
  };
}

final class InstallmentResult {
  InstallmentResult({
    required this.id,
    required List<InstanceId> instanceIds,
    required this.obligationRevision,
    required List<InstanceRevision> instanceRevisions,
  }) : instanceIds = List.unmodifiable(instanceIds),
       instanceRevisions = List.unmodifiable(instanceRevisions);
  final ObligationId id;
  final List<InstanceId> instanceIds;
  final int obligationRevision;
  final List<InstanceRevision> instanceRevisions;
}
