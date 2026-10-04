import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/data_page.dart';
import 'payment_commands.dart';
import 'payment_entry.dart';

abstract interface class PaymentsRepository {
  OwnerUid get owner;
  Stream<DataPage<PaymentEntry>> watchPayments(
    ObligationId obligationId, {
    int limit = 50,
  });
  Future<DataPage<PaymentEntry>> getPayments(
    ObligationId obligationId, {
    int limit = 50,
    PageCursor? after,
  });
  Future<PaymentResult> recordInstallment(
    InstallmentPaymentDraft draft,
    CommandId commandId,
  );
  Future<PaymentResult> record(PaymentDraft draft, CommandId commandId);
  Future<CorrectionResult> correct(
    PaymentCorrection correction,
    CommandId commandId,
  );
}
