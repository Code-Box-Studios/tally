import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../../../shared/data/document_reader.dart';
import '../domain/obligation.dart';
import '../domain/obligation_instance.dart';

abstract final class InstanceDto {
  static ObligationInstance fromMap(
    String id,
    Map<String, Object?> data,
    OwnerUid owner,
  ) {
    final d = DocumentReader(data)
      ..owner(owner)
      ..storedId('instanceId', id);
    final currency = CurrencyCode.parse(d.text('currency', max: 3));
    final amount = d.nullableMoney('amountMinor', currency, positive: true);
    final paid = d.money('totalPaidMinor', currency);
    final remaining = d.nullableMoney('remainingMinor', currency);
    if (amount == null
        ? (d.text('amountState') != 'needed' ||
              remaining != null ||
              paid.minorUnits != 0 ||
              d.boolean('closed'))
        : (d.text('amountState') != 'known' ||
              remaining == null ||
              paid.add(remaining) != amount)) {
      throw DocumentReader.invalid();
    }
    return ObligationInstance(
      id: InstanceId(id),
      obligationId: ObligationId(d.text('obligationId', max: 128)),
      owner: owner,
      title: d.object('snapshot').text('title', max: 120, required: true),
      currency: currency,
      amount: amount,
      paidAmount: paid,
      remainingAmount: remaining,
      dueDate: d.nullableDate('dueDate'),
      occurrenceDate: d.date('occurrenceDate'),
      timezone: d.timezone('timezone'),
      direction: d.enumeration('direction', ObligationDirection.values),
      section: d.enumeration('section', ObligationSection.values),
      status: d.enumeration('financialStatus', FinancialStatus.values),
      paymentMode: d.enumeration('paymentMode', PaymentMode.values),
      paymentSourceId: d.nullableText('paymentSourceId', max: 128) == null
          ? null
          : SourceId(d.text('paymentSourceId', max: 128)),
      contactId: d.nullableText('contactId', max: 128) == null
          ? null
          : ContactId(d.text('contactId', max: 128)),
      categoryId: CategoryId(d.text('categoryId', max: 128)),
      periodLabel: d.text('periodLabel', max: 120),
      closed: d.boolean('closed'),
      revision: d.revision(),
    );
  }
}
