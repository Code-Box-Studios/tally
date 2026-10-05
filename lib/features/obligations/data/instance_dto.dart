import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../../../shared/data/document_reader.dart';
import '../domain/obligation.dart';
import '../domain/obligation_instance.dart';
import '../../../shared/data/catalog_dto.dart';
import '../../recurring/domain/deduction_attempt.dart';

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
    final section = d.enumeration('section', ObligationSection.values),
        status = d.enumeration('financialStatus', FinancialStatus.values),
        closed = d.boolean('closed');
    final recurring = section == ObligationSection.monthlyDues;
    final skippedOrCancelled =
        status == FinancialStatus.skipped ||
        status == FinancialStatus.cancelled;
    if (amount == null
        ? ((d.text('amountState') != 'unknown' &&
                  (recurring || d.text('amountState') != 'needed')) ||
              remaining != null ||
              paid.minorUnits != 0 ||
              closed && !skippedOrCancelled)
        : (d.text('amountState') != 'known' ||
              remaining == null ||
              paid.add(remaining) != amount)) {
      throw DocumentReader.invalid();
    }
    final snapshot = d.object('snapshot'),
        mode = d.enumeration('paymentMode', PaymentMode.values);
    final rawDeduction = data['deductionStatus'];
    final deduction = rawDeduction == null
        ? DeductionStatus.none
        : d.enumeration('deductionStatus', DeductionStatus.values);
    if (recurring &&
        (mode == PaymentMode.manual
            ? deduction != DeductionStatus.none
            : deduction == DeductionStatus.none)) {
      throw DocumentReader.invalid();
    }
    if (recurring &&
        closed != (skippedOrCancelled || remaining?.minorUnits == 0)) {
      throw DocumentReader.invalid();
    }
    final scheduledAt = recurring && mode != PaymentMode.manual
        ? d.dateTime('deductionAt')
        : null;
    final deductionDate = recurring ? d.nullableDate('deductionDate') : null;
    final localTime = recurring ? d.text('localDeductionTime', max: 5) : null;
    if (recurring &&
        (!RegExp(r'^(?:[01]\d|2[0-3]):[0-5]\d$').hasMatch(localTime!) ||
            mode != PaymentMode.manual && deductionDate == null)) {
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
      section: section,
      status: status,
      paymentMode: mode,
      paymentSourceId: d.nullableText('paymentSourceId', max: 128) == null
          ? null
          : SourceId(d.text('paymentSourceId', max: 128)),
      contactId: d.nullableText('contactId', max: 128) == null
          ? null
          : ContactId(d.text('contactId', max: 128)),
      categoryId: CategoryId(d.text('categoryId', max: 128)),
      periodLabel: d.text('periodLabel', max: 120),
      closed: closed,
      revision: d.revision(),
      hasPaymentHistory: data.containsKey('hasPaymentHistory')
          ? d.boolean('hasPaymentHistory')
          : null,
      deductionStatus: deduction,
      deductionAt: scheduledAt,
      deductionDate: deductionDate,
      localDeductionTime: localTime,
      requiresDeductionConfirmation: recurring
          ? d.boolean('requiresDeductionConfirmation')
          : false,
      estimatedAmount: recurring
          ? snapshot.nullableMoney(
              'estimatedAmountMinor',
              currency,
              positive: true,
            )
          : null,
      source: recurring
          ? CatalogDto.sourceLabel(
              data.containsKey('paymentSourceOverrideSnapshot')
                  ? d.nullableObject('paymentSourceOverrideSnapshot')
                  : snapshot.nullableObject('sourceSnapshot'),
            )
          : null,
      notes: recurring
          ? data.containsKey('notes')
                ? d.text('notes')
                : snapshot.text('notes')
          : '',
    );
  }
}
