import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../../../shared/data/document_reader.dart';
import '../../../shared/data/catalog_dto.dart';
import '../domain/deduction_attempt.dart';

abstract final class DeductionDto {
  static DeductionAttempt attempt(
    String id,
    Map<String, Object?> data,
    OwnerUid owner,
  ) {
    final d = DocumentReader(data)
          ..owner(owner)
          ..storedId('attemptId', id),
        currency = CurrencyCode.parse(d.text('currency', max: 3));
    final type = d.enumeration('eventType', DeductionAttemptType.values),
        actor = d.enumeration('actor', DeductionActor.values);
    if ([
          DeductionAttemptType.assumed,
          DeductionAttemptType.expected,
          DeductionAttemptType.suppressed,
        ].contains(type)
        ? actor != DeductionActor.system
        : actor != DeductionActor.user) {
      throw DocumentReader.invalid();
    }
    final payment = d.nullableText('paymentId', max: 128),
        source = d.nullableText('paymentSourceId', max: 128);
    return DeductionAttempt(
      id: DeductionAttemptId(id),
      owner: owner,
      obligationId: ObligationId(
        d.text('obligationId', max: 128, required: true),
      ),
      instanceId: InstanceId(d.text('instanceId', max: 128, required: true)),
      eventKey: d.text('eventKey', max: 120, required: true),
      type: type,
      currency: currency,
      amount: d.nullableMoney('expectedAmountMinor', currency),
      paymentId: payment == null ? null : PaymentId(payment),
      reason: d.nullableText('reason', max: 1000),
      sourceId: source == null ? null : SourceId(source),
      source: CatalogDto.sourceLabel(d.nullableObject('sourceSnapshot')),
      scheduledDate: d.nullableDate('scheduledDate'),
      timezone: d.timezone('timezone'),
      processedAt: d.dateTime('processedAt'),
      actor: actor,
    );
  }

  static PaymentEvidence evidence(
    String id,
    Map<String, Object?> data,
    OwnerUid owner,
  ) {
    final d = DocumentReader(data)
      ..owner(owner)
      ..storedId('evidenceId', id);
    if (d.value('kind') != 'userConfirmed' || d.value('actor') != 'user') {
      throw DocumentReader.invalid();
    }
    return PaymentEvidence(
      id: PaymentEvidenceId(id),
      owner: owner,
      obligationId: ObligationId(
        d.text('obligationId', max: 128, required: true),
      ),
      instanceId: InstanceId(d.text('instanceId', max: 128, required: true)),
      paymentId: PaymentId(d.text('paymentId', max: 128, required: true)),
      notes: d.text('notes'),
      recordedAt: d.dateTime('recordedAt'),
    );
  }
}
