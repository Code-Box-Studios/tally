import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/data/document_reader.dart';
import '../../../shared/data/financial_repository_base.dart';
import '../../../shared/data/owner_document_gateway.dart';
import '../../../shared/domain/data_page.dart';
import '../../obligations/data/instance_dto.dart';
import '../../obligations/domain/obligation_instance.dart';
import '../domain/deduction_attempt.dart';
import '../domain/recurring_commands.dart';
import '../domain/recurring_repository.dart';
import 'deduction_dto.dart';

final class _RecurringCursor implements PageCursor {
  const _RecurringCursor(this.owner, this.collection, this.subjectId, this.raw);
  final OwnerUid owner;
  final String collection, subjectId;
  final PageCursor raw;
}

final class FirestoreRecurringRepository extends FinancialRepositoryBase
    implements RecurringRepository {
  FirestoreRecurringRepository(super.documents, super.commands);
  DocumentQuery _query(String collection, String subjectId, PageCursor? after) {
    PageCursor? raw;
    if (after != null) {
      if (after is! _RecurringCursor ||
          after.owner != owner ||
          after.collection != collection ||
          after.subjectId != subjectId) {
        throw DocumentReader.invalid();
      }
      raw = after.raw;
    }
    final periods = collection == 'obligationInstances';
    return DocumentQuery(
      collection,
      after: raw,
      equals: {periods ? 'obligationId' : 'instanceId': subjectId},
      order: [
        DocumentOrder(
          periods
              ? 'occurrenceDate'
              : collection == 'deductionAttempts'
              ? 'processedAt'
              : 'recordedAt',
          descending: !periods,
        ),
      ],
    );
  }

  DataPage<T> _bound<T>(
    DataPage<T> page,
    String collection,
    String subjectId,
  ) => DataPage(
    items: page.items,
    nextCursor: page.nextCursor == null
        ? null
        : _RecurringCursor(owner, collection, subjectId, page.nextCursor!),
    hasMore: page.hasMore,
    isFromCache: page.isFromCache,
  );
  Stream<DataPage<T>> _watch<T>(
    String collection,
    String subjectId,
    T Function(RawDocument) map,
  ) => watch(
    _query(collection, subjectId, null),
    map,
  ).map((page) => _bound(page, collection, subjectId));
  Future<DataPage<T>> _get<T>(
    String collection,
    String subjectId,
    PageCursor? after,
    T Function(RawDocument) map,
  ) async => _bound(
    await get(_query(collection, subjectId, after), map),
    collection,
    subjectId,
  );
  ObligationInstance _period(RawDocument doc) =>
      InstanceDto.fromMap(doc.id, doc.data, owner);
  DeductionAttempt _attempt(RawDocument doc) =>
      DeductionDto.attempt(doc.id, doc.data, owner);
  PaymentEvidence _evidence(RawDocument doc) =>
      DeductionDto.evidence(doc.id, doc.data, owner);
  @override
  Stream<DataPage<ObligationInstance>> watchPeriods(ObligationId id) =>
      _watch('obligationInstances', id.value, _period);
  @override
  Future<DataPage<ObligationInstance>> getPeriods(
    ObligationId id, {
    PageCursor? after,
  }) => _get('obligationInstances', id.value, after, _period);
  @override
  Stream<DataPage<DeductionAttempt>> watchAttempts(InstanceId id) =>
      _watch('deductionAttempts', id.value, _attempt);
  @override
  Future<DataPage<DeductionAttempt>> getAttempts(
    InstanceId id, {
    PageCursor? after,
  }) => _get('deductionAttempts', id.value, after, _attempt);
  @override
  Stream<DataPage<PaymentEvidence>> watchEvidence(InstanceId id) =>
      _watch('paymentEvidence', id.value, _evidence);
  @override
  Future<DataPage<PaymentEvidence>> getEvidence(
    InstanceId id, {
    PageCursor? after,
  }) => _get('paymentEvidence', id.value, after, _evidence);
  RecurringResult _recurring(Map<String, Object?> raw, String action) {
    final d = DocumentReader(raw),
        first = action == 'create'
            ? d.nullableText('firstInstanceId', max: 128)
            : null;
    return RecurringResult(
      obligationId: ObligationId(
        d.text('obligationId', max: 128, required: true),
      ),
      obligationRevision: d.integer('obligationRevision', min: 1),
      generationRevision: d.integer('generationRevision', min: 1),
      firstInstanceId: first == null ? null : InstanceId(first),
      appliesAfter: action == 'edit' ? d.nullableDate('appliesAfter') : null,
      retainedFutureCount: action == 'lifecycle'
          ? d.integer('retainedFutureCount')
          : null,
    );
  }

  PeriodResult _periodResult(Map<String, Object?> raw) {
    final d = DocumentReader(raw);
    return PeriodResult(
      ObligationId(d.text('obligationId', max: 128, required: true)),
      InstanceId(d.text('instanceId', max: 128, required: true)),
      d.integer('instanceRevision', min: 1),
    );
  }

  @override
  Future<RecurringResult> create(
    RecurringDraft draft,
    CommandId commandId,
  ) async => _recurring(
    await commands.call('createRecurring', commandId, draft.toPayload()),
    'create',
  );
  @override
  Future<RecurringResult> edit(
    RecurringEdit change,
    CommandId commandId,
  ) async => _recurring(
    await commands.call('editRecurring', commandId, change.toPayload()),
    'edit',
  );
  @override
  Future<RecurringResult> changeLifecycle(
    LifecycleChange change,
    CommandId commandId,
  ) async => _recurring(
    await commands.call(
      'changeRecurringLifecycle',
      commandId,
      change.toPayload(),
    ),
    'lifecycle',
  );
  @override
  Future<PeriodResult> setAmount(
    InstanceAmountEdit change,
    CommandId commandId,
  ) async => _periodResult(
    await commands.call('setRecurringAmount', commandId, change.toPayload()),
  );
  @override
  Future<PeriodResult> editPeriod(
    RecurringInstanceEdit change,
    CommandId commandId,
  ) async => _periodResult(
    await commands.call('editRecurringInstance', commandId, change.toPayload()),
  );
  @override
  Future<PeriodResult> skip(InstanceSkip change, CommandId commandId) async =>
      _periodResult(
        await commands.call(
          'skipRecurringInstance',
          commandId,
          change.toPayload(),
        ),
      );
  @override
  Future<DeductionConfirmationResult> confirm(
    DeductionConfirmation change,
    CommandId commandId,
  ) async {
    final d = DocumentReader(
          await commands.call(
            'confirmDeduction',
            commandId,
            change.toPayload(),
          ),
        ),
        evidence = d.nullableText('evidenceId', max: 128);
    return DeductionConfirmationResult(
      obligationId: ObligationId(
        d.text('obligationId', max: 128, required: true),
      ),
      instanceId: InstanceId(d.text('instanceId', max: 128, required: true)),
      obligationRevision: d.integer('obligationRevision', min: 1),
      instanceRevision: d.integer('instanceRevision', min: 1),
      paymentId: PaymentId(d.text('paymentId', max: 128, required: true)),
      evidenceId: evidence == null ? null : PaymentEvidenceId(evidence),
    );
  }

  @override
  Future<DeductionFailureResult> reportFailure(
    DeductionFailure change,
    CommandId commandId,
  ) async {
    final d = DocumentReader(
          await commands.call(
            'reportDeductionFailure',
            commandId,
            change.toPayload(),
          ),
        ),
        reversal = d.nullableText('reversalId', max: 128);
    return DeductionFailureResult(
      obligationId: ObligationId(
        d.text('obligationId', max: 128, required: true),
      ),
      instanceId: InstanceId(d.text('instanceId', max: 128, required: true)),
      obligationRevision: d.integer('obligationRevision', min: 1),
      instanceRevision: d.integer('instanceRevision', min: 1),
      reversalId: reversal == null ? null : PaymentId(reversal),
      attemptId: DeductionAttemptId(
        d.text('attemptId', max: 128, required: true),
      ),
    );
  }
}
