import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../../../core/money/money.dart';
import '../../../shared/data/document_reader.dart';
import '../../../shared/data/catalog_dto.dart';
import '../../obligations/domain/obligation.dart';
import '../domain/payment_entry.dart';

abstract final class PaymentDto {
  static PaymentEntry fromMap(
    String id,
    Map<String, Object?> data,
    OwnerUid owner,
  ) {
    final d = DocumentReader(data)
      ..owner(owner)
      ..storedId('paymentId', id);
    final currency = CurrencyCode.parse(d.text('currency', max: 3));
    final amount = d.money('amountMinor', currency, positive: true);
    final allocations = [
      for (final allocation in d.objects('allocations', min: 1, max: 24))
        PaymentAllocation(
          InstanceId(allocation.text('instanceId', max: 128)),
          allocation.money('amountMinor', currency, positive: true),
        ),
    ];
    var sum = Money.fromMinorUnits(0, currency);
    for (final allocation in allocations) {
      sum = sum.add(allocation.amount);
    }
    if (sum != amount ||
        allocations.map((item) => item.instanceId).toSet().length !=
            allocations.length) {
      throw DocumentReader.invalid();
    }
    final instance = d.nullableText('obligationInstanceId', max: 128);
    if (instance !=
        (allocations.length == 1 ? allocations.single.instanceId.value : null)) {
      throw DocumentReader.invalid();
    }
    final type = d.enumeration('entryType', PaymentEntryType.values);
    final reverses = d.nullableText('reversesPaymentId', max: 128);
    final group = d.nullableText('correctionGroupId', max: 128);
    final reason = d.nullableText('correctionReason', max: 1000);
    if ((type == PaymentEntryType.reversal &&
            (reverses == null ||
                group == null ||
                reason == null ||
                reason.isEmpty)) ||
        (type == PaymentEntryType.payment && reverses != null) ||
        d.dateTime('createdAt') != d.dateTime('updatedAt')) {
      throw DocumentReader.invalid();
    }
    return PaymentEntry(
      id: PaymentId(id),
      owner: owner,
      obligationId: ObligationId(d.text('obligationId', max: 128)),
      instanceId: d.nullableText('obligationInstanceId', max: 128) == null
          ? null
          : InstanceId(d.text('obligationInstanceId', max: 128)),
      allocations: allocations,
      type: type,
      amount: amount,
      date: d.date('paymentDate'),
      timezone: d.timezone('paymentTimezone'),
      sourceId: d.nullableText('paymentSourceId', max: 128) == null
          ? null
          : SourceId(d.text('paymentSourceId', max: 128)),
      source: CatalogDto.sourceLabel(d.nullableObject('sourceSnapshot')),
      method: d.enumeration('paymentMethod', PaymentMethod.values),
      provenance: d.enumeration('provenance', PaymentProvenance.values),
      direction: d.enumeration('direction', ObligationDirection.values),
      contactId: d.nullableText('contactId', max: 128) == null
          ? null
          : ContactId(d.text('contactId', max: 128)),
      categoryId: CategoryId(d.text('categoryId', max: 128)),
      notes: d.text('notes'),
      commandId: CommandId(d.text('commandId', max: 128)),
      reversesPaymentId: reverses == null ? null : PaymentId(reverses),
      correctionGroupId: group,
      correctionReason: reason,
      createdAt: d.dateTime('createdAt'),
      recordedAt: d.dateTime('recordedAt'),
    );
  }
}
