import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/data/document_reader.dart';
import '../../../shared/data/financial_repository_base.dart';
import '../../../shared/data/owner_document_gateway.dart';
import '../../../shared/domain/data_page.dart';
import '../domain/payment_commands.dart';
import '../domain/payment_entry.dart';
import '../domain/payments_repository.dart';
import 'payment_dto.dart';

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
  @override
  Future<PaymentResult> record(PaymentDraft draft, CommandId commandId) async {
    final data = DocumentReader(
      await commands.call('recordPayment', commandId, draft.toPayload()),
    );
    return PaymentResult(
      PaymentId(data.text('paymentId', required: true)),
      ObligationId(data.text('obligationId', required: true)),
      InstanceId(data.text('obligationInstanceId', required: true)),
      data.integer('obligationRevision', min: 1),
      data.integer('instanceRevision', min: 1),
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
      InstanceId(data.text('obligationInstanceId', required: true)),
      data.integer('obligationRevision', min: 1),
      data.integer('instanceRevision', min: 1),
    );
  }
}
