import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/data/document_reader.dart';
import '../../../shared/data/financial_repository_base.dart';
import '../../../shared/data/owner_document_gateway.dart';
import '../../../shared/domain/data_page.dart';
import '../domain/payment_commands.dart';
import '../domain/payment_entry.dart';
import '../../../shared/domain/instance_revision.dart';
import '../domain/payments_repository.dart';
import 'payment_dto.dart';

final class _PeriodPaymentsCursor implements PageCursor {
  const _PeriodPaymentsCursor(
    this.owner,
    this.parent,
    this.period,
    this.limit,
    this.raw,
  );
  final OwnerUid owner;
  final ObligationId parent;
  final InstanceId period;
  final int limit;
  final PageCursor raw;
}

final class FirestorePaymentsRepository extends FinancialRepositoryBase
    implements PaymentsRepository {
  FirestorePaymentsRepository(super.documents, super.commands);
  DocumentQuery _query(ObligationId id, int limit, PageCursor? after) =>
      DocumentQuery(
        'payments',
        limit: limit,
        after: after,
        equals: {'obligationId': id.value},
        order: const [
          DocumentOrder('paymentDate', descending: true),
          DocumentOrder('createdAt', descending: true),
        ],
      );
  PaymentEntry _entry(RawDocument doc) =>
      PaymentDto.fromMap(doc.id, doc.data, owner);
  @override
  Stream<DataPage<PaymentEntry>> watchPayments(
    ObligationId obligationId, {
    int limit = 50,
  }) => watch(_query(obligationId, limit, null), _entry);
  @override
  Future<DataPage<PaymentEntry>> getPayments(
    ObligationId obligationId, {
    int limit = 50,
    PageCursor? after,
  }) => get(_query(obligationId, limit, after), _entry);

  DocumentQuery _periodQuery(
    ObligationId parent,
    InstanceId period,
    int limit,
    PageCursor? after,
  ) {
    PageCursor? raw;
    if (after != null) {
      if (after is! _PeriodPaymentsCursor ||
          after.owner != owner ||
          after.parent != parent ||
          after.period != period ||
          after.limit != limit) {
        throw DocumentReader.invalid();
      }
      raw = after.raw;
    }
    return DocumentQuery(
      'payments',
      limit: limit,
      after: raw,
      equals: {
        'obligationId': parent.value,
        'obligationInstanceId': period.value,
      },
      order: const [
        DocumentOrder('paymentDate', descending: true),
        DocumentOrder('createdAt', descending: true),
      ],
    );
  }

  DataPage<PaymentEntry> _boundPeriod(
    DataPage<PaymentEntry> page,
    ObligationId parent,
    InstanceId period,
    int limit,
  ) => DataPage(
    items: page.items,
    nextCursor: page.nextCursor == null
        ? null
        : _PeriodPaymentsCursor(owner, parent, period, limit, page.nextCursor!),
    hasMore: page.hasMore,
    isFromCache: page.isFromCache,
  );

  @override
  Stream<DataPage<PaymentEntry>> watchPeriodPayments(
    ObligationId obligationId,
    InstanceId instanceId, {
    int limit = 50,
  }) => watch(
    _periodQuery(obligationId, instanceId, limit, null),
    _entry,
  ).map((page) => _boundPeriod(page, obligationId, instanceId, limit));
  @override
  Future<DataPage<PaymentEntry>> getPeriodPayments(
    ObligationId obligationId,
    InstanceId instanceId, {
    int limit = 50,
    PageCursor? after,
  }) async => _boundPeriod(
    await get(_periodQuery(obligationId, instanceId, limit, after), _entry),
    obligationId,
    instanceId,
    limit,
  );
  @override
  Future<PaymentResult> record(PaymentDraft draft, CommandId commandId) async {
    final data = DocumentReader(
      await commands.call('recordPayment', commandId, draft.toPayload()),
    );
    return PaymentResult(
      PaymentId(data.text('paymentId', required: true)),
      ObligationId(data.text('obligationId', required: true)),
      data.nullableText('obligationInstanceId', max: 128) == null
          ? null
          : InstanceId(data.text('obligationInstanceId', max: 128)),
      data.integer('obligationRevision', min: 1),
      data.value('instanceRevision') == null
          ? null
          : data.integer('instanceRevision', min: 1),
      allocationRevisions: _revisions(data),
    );
  }

  @override
  Future<CorrectionResult> correct(
    PaymentCorrection correction,
    CommandId commandId,
  ) async {
    final data = DocumentReader(
      await commands.call('correctPayment', commandId, correction.toPayload()),
    );
    final replacement = data.nullableText('replacementId', max: 128);
    return CorrectionResult(
      PaymentId(data.text('originalPaymentId', required: true)),
      PaymentId(data.text('reversalId', required: true)),
      replacement == null ? null : PaymentId(replacement),
      ObligationId(data.text('obligationId', required: true)),
      data.nullableText('obligationInstanceId', max: 128) == null
          ? null
          : InstanceId(data.text('obligationInstanceId', max: 128)),
      data.integer('obligationRevision', min: 1),
      data.value('instanceRevision') == null
          ? null
          : data.integer('instanceRevision', min: 1),
      allocationRevisions: _revisions(data),
    );
  }

  List<InstanceRevision> _revisions(DocumentReader data) {
    final single = data.nullableText('obligationInstanceId', max: 128);
    final raw = data.data['allocationRevisions'];
    if (raw == null) {
      if (single == null || data.value('instanceRevision') == null) {
        throw DocumentReader.invalid();
      }
      return [
        InstanceRevision(
          InstanceId(single),
          data.integer('instanceRevision', min: 1),
        ),
      ];
    }
    final revisions = [
      for (final entry in data.objects('allocationRevisions', min: 1, max: 48))
        InstanceRevision(
          InstanceId(entry.text('instanceId', max: 128)),
          entry.integer('instanceRevision', min: 1),
        ),
    ];
    if (revisions.map((r) => r.id).toSet().length != revisions.length ||
        (single == null &&
            (data.value('instanceRevision') != null || revisions.length < 2)) ||
        (single != null &&
            !revisions.any(
              (r) =>
                  r.id.value == single &&
                  r.revision == data.integer('instanceRevision', min: 1),
            ))) {
      throw DocumentReader.invalid();
    }
    return revisions;
  }

  @override
  Future<PaymentResult> recordInstallment(
    InstallmentPaymentDraft draft,
    CommandId commandId,
  ) async {
    final data = DocumentReader(
      await commands.call(
        'recordInstallmentPayment',
        commandId,
        draft.toPayload(),
      ),
    );
    final revisions = _revisions(data);
    if (revisions.length > 24) throw DocumentReader.invalid();
    return PaymentResult(
      PaymentId(data.text('paymentId', max: 128, required: true)),
      ObligationId(data.text('obligationId', max: 128, required: true)),
      data.nullableText('obligationInstanceId', max: 128) == null
          ? null
          : InstanceId(data.text('obligationInstanceId', max: 128)),
      data.integer('obligationRevision', min: 1),
      data.value('instanceRevision') == null
          ? null
          : data.integer('instanceRevision', min: 1),
      allocationRevisions: revisions,
    );
  }
}
