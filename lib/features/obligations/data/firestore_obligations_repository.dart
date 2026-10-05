import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/data/document_reader.dart';
import '../../../shared/data/financial_repository_base.dart';
import '../../../shared/data/financial_failure_mapper.dart';
import '../../../shared/data/owner_document_gateway.dart';
import '../../../shared/domain/data_page.dart';
import '../domain/obligation.dart';
import '../domain/installment_commands.dart';
import '../../../shared/domain/instance_revision.dart';
import '../domain/obligation_commands.dart';
import '../domain/obligation_instance.dart';
import '../domain/obligations_repository.dart';
import 'obligation_dto.dart';
import 'instance_dto.dart';

final class FirestoreObligationsRepository extends FinancialRepositoryBase
    implements ObligationsRepository {
  FirestoreObligationsRepository(super.documents, super.commands);
  DocumentQuery _obligations(
    ObligationSection? section,
    ContactId? contact,
    int limit,
    PageCursor? after,
  ) => DocumentQuery(
    'obligations',
    limit: limit,
    after: after,
    equals: {
      'archived': false,
      if (section != null) 'section': section.name,
      if (contact != null) 'contactId': contact.value,
    },
    order: const [DocumentOrder('createdAt', descending: true)],
  );
  Obligation _obligation(RawDocument doc) =>
      ObligationDto.fromMap(doc.id, doc.data, owner);
  @override
  Stream<DataPage<Obligation>> watchObligations({
    ObligationSection? section,
    ContactId? contact,
    int limit = 50,
  }) => watch(_obligations(section, contact, limit, null), _obligation);
  @override
  Future<DataPage<Obligation>> getObligations({
    ObligationSection? section,
    ContactId? contact,
    int limit = 50,
    PageCursor? after,
  }) => get(_obligations(section, contact, limit, after), _obligation);
  @override
  Stream<DataRecord<Obligation?>> watchObligation(ObligationId id) async* {
    try {
      await for (final record in documents.watchDocument(
        'obligations',
        id.value,
      )) {
        final doc = record.document;
        yield DataRecord(
          doc == null ? null : _obligation(doc),
          isFromCache: record.isFromCache,
        );
      }
    } catch (error) {
      yield* Stream.error(financialFailure(error));
    }
  }

  DocumentQuery _instances(ObligationId id, int limit, PageCursor? after) =>
      DocumentQuery(
        'obligationInstances',
        limit: limit,
        after: after,
        equals: {'obligationId': id.value},
        order: const [DocumentOrder('dueDate')],
      );
  ObligationInstance _instance(RawDocument doc) =>
      InstanceDto.fromMap(doc.id, doc.data, owner);
  @override
  Stream<DataRecord<ObligationInstance?>> watchInstance(InstanceId id) async* {
    try {
      await for (final record in documents.watchDocument(
        'obligationInstances',
        id.value,
      )) {
        final doc = record.document;
        yield DataRecord(
          doc == null ? null : _instance(doc),
          isFromCache: record.isFromCache,
        );
      }
    } catch (error) {
      yield* Stream.error(financialFailure(error));
    }
  }

  @override
  Stream<DataPage<ObligationInstance>> watchInstances(
    ObligationId id, {
    int limit = 50,
  }) => watch(_instances(id, limit, null), _instance);
  @override
  Future<DataPage<ObligationInstance>> getInstances(
    ObligationId id, {
    int limit = 50,
    PageCursor? after,
  }) => get(_instances(id, limit, after), _instance);
  ObligationResult _result(Map<String, Object?> raw) {
    final data = DocumentReader(raw);
    return ObligationResult(
      id: ObligationId(data.text('obligationId', required: true)),
      instanceId: InstanceId(data.text('obligationInstanceId', required: true)),
      obligationRevision: data.integer('obligationRevision', min: 1),
      instanceRevision: data.integer('instanceRevision', min: 1),
    );
  }

  @override
  Future<ObligationResult> create(
    ObligationDraft draft,
    CommandId commandId,
  ) async => _result(
    await commands.call('createObligation', commandId, draft.toPayload()),
  );
  @override
  Future<ObligationResult> edit(
    ObligationId id,
    int expectedRevision,
    ObligationDraft draft,
    CommandId commandId,
  ) async => _result(
    await commands.call('editObligation', commandId, {
      ...draft.toPayload(),
      'obligationId': id.value,
      'expectedRevision': expectedRevision,
    }),
  );
  @override
  Future<ObligationResult> cancel(
    ObligationId id,
    int expectedRevision,
    String reason,
    CommandId commandId,
  ) async => _result(
    await commands.call('cancelObligation', commandId, {
      'obligationId': id.value,
      'expectedRevision': expectedRevision,
      'reason': reason,
    }),
  );
  InstallmentResult _installmentResult(Map<String, Object?> raw) {
    final data = DocumentReader(raw);
    final ids = raw['obligationInstanceIds'];
    if (ids is! List ||
        ids.length < 2 ||
        ids.length > 120 ||
        ids.any((id) => id is! String)) {
      throw DocumentReader.invalid();
    }
    final instanceIds = ids.map((id) => InstanceId(id as String)).toList();
    final revisions = [
      for (final item in data.objects('instanceRevisions', min: 2, max: 120))
        InstanceRevision(
          InstanceId(item.text('instanceId', max: 128)),
          item.integer('instanceRevision', min: 1),
        ),
    ];
    if (instanceIds.toSet().length != instanceIds.length ||
        revisions.map((r) => r.id).toSet().length != revisions.length ||
        revisions.length != instanceIds.length ||
        !revisions.every((r) => instanceIds.contains(r.id))) {
      throw DocumentReader.invalid();
    }
    return InstallmentResult(
      id: ObligationId(data.text('obligationId', max: 128, required: true)),
      instanceIds: instanceIds,
      obligationRevision: data.integer('obligationRevision', min: 1),
      instanceRevisions: revisions,
    );
  }

  @override
  Future<InstallmentResult> createInstallment(
    InstallmentDraft draft,
    CommandId commandId,
  ) async => _installmentResult(
    await commands.call('createInstallment', commandId, draft.toPayload()),
  );
  @override
  Future<InstallmentResult> editInstallment(
    ObligationId id,
    int expectedRevision,
    InstallmentDraft draft,
    CommandId commandId,
  ) async => _installmentResult(
    await commands.call('editInstallment', commandId, {
      ...draft.toPayload(),
      'obligationId': id.value,
      'expectedRevision': expectedRevision,
    }),
  );
  @override
  Future<InstallmentResult> cancelInstallment(
    ObligationId id,
    int expectedRevision,
    String reason,
    CommandId commandId,
  ) async => _installmentResult(
    await commands.call('cancelInstallment', commandId, {
      'obligationId': id.value,
      'expectedRevision': expectedRevision,
      'reason': reason,
    }),
  );
}
