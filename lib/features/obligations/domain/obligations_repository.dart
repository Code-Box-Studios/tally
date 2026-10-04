import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/data_page.dart';
import 'obligation.dart';
import 'installment_commands.dart';
import 'obligation_commands.dart';
import 'obligation_instance.dart';

abstract interface class ObligationsRepository {
  OwnerUid get owner;
  Stream<DataPage<Obligation>> watchObligations({
    ObligationSection? section,
    ContactId? contact,
    int limit = 50,
  });
  Future<DataPage<Obligation>> getObligations({
    ObligationSection? section,
    ContactId? contact,
    int limit = 50,
    PageCursor? after,
  });
  Stream<DataRecord<Obligation?>> watchObligation(ObligationId id);
  Stream<DataPage<ObligationInstance>> watchInstances(
    ObligationId id, {
    int limit = 50,
  });
  Future<DataPage<ObligationInstance>> getInstances(
    ObligationId id, {
    int limit = 50,
    PageCursor? after,
  });
  Future<InstallmentResult> createInstallment(
    InstallmentDraft draft,
    CommandId commandId,
  );
  Future<InstallmentResult> editInstallment(
    ObligationId id,
    int expectedRevision,
    InstallmentDraft draft,
    CommandId commandId,
  );
  Future<InstallmentResult> cancelInstallment(
    ObligationId id,
    int expectedRevision,
    String reason,
    CommandId commandId,
  );
  Future<ObligationResult> create(ObligationDraft draft, CommandId commandId);
  Future<ObligationResult> edit(
    ObligationId id,
    int expectedRevision,
    ObligationDraft draft,
    CommandId commandId,
  );
  Future<ObligationResult> cancel(
    ObligationId id,
    int expectedRevision,
    String reason,
    CommandId commandId,
  );
}
