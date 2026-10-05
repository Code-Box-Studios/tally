import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../../../shared/data/document_reader.dart';
import '../../../shared/data/catalog_dto.dart';
import '../domain/obligation.dart';
import '../../recurring/data/recurrence_dto.dart';

abstract final class ObligationDto {
  static Obligation fromMap(
    String id,
    Map<String, Object?> data,
    OwnerUid owner,
  ) {
    final d = DocumentReader(data)
      ..owner(owner)
      ..storedId('obligationId', id);
    final currency = CurrencyCode.parse(d.text('currency', max: 3));
    final type = d.enumeration('type', ObligationType.values);
    final recurring =
        type == ObligationType.recurringDue ||
        type == ObligationType.subscription;
    final original = d.nullableMoney(
      'originalAmountMinor',
      currency,
      positive: true,
    );
    final paid = d.nullableMoney('totalPaidMinor', currency);
    final remaining = d.nullableMoney('remainingMinor', currency);
    if (recurring
        ? (original != null || paid != null || remaining != null)
        : (original == null ||
              paid == null ||
              remaining == null ||
              paid.minorUnits > original.minorUnits ||
              paid.add(remaining) != original)) {
      throw DocumentReader.invalid();
    }
    final direction = d.enumeration('direction', ObligationDirection.values);
    final section = d.enumeration('section', ObligationSection.values);
    if ((recurring &&
            (section != ObligationSection.monthlyDues ||
                direction != ObligationDirection.owedByMe)) ||
        (!recurring &&
            section !=
                (direction == ObligationDirection.owedByMe
                    ? ObligationSection.iOwe
                    : ObligationSection.owedToMe))) {
      throw DocumentReader.invalid();
    }
    final single = d.nullableText('singleInstanceId', max: 128);
    final rawIds = data['installmentInstanceIds'];
    final ids = <InstanceId>[];
    if (type == ObligationType.installment) {
      if (single != null ||
          rawIds is! List ||
          rawIds.length < 2 ||
          rawIds.length > 120) {
        throw DocumentReader.invalid();
      }
      for (final raw in rawIds) {
        if (raw is! String) throw DocumentReader.invalid();
        ids.add(InstanceId(raw));
      }
      if (ids.toSet().length != ids.length) throw DocumentReader.invalid();
    } else if (!recurring && single == null) {
      throw DocumentReader.invalid();
    }
    final origination = d.date('originationDate');
    final due = d.nullableDate('dueDate');
    if (due != null && due.compareTo(origination) < 0) {
      throw DocumentReader.invalid();
    }
    final interest = d.nullableObject('interestInfo');
    final recurrence = recurring
        ? RecurrenceDto.fromMap(d.object('recurrence').data)
        : null;
    if (recurring &&
        (single != null ||
            due != null ||
            d.nullableDate('nextDueDate') != null ||
            recurrence!.rule.timezone != d.timezone('timezone'))) {
      throw DocumentReader.invalid();
    }
    return Obligation(
      id: ObligationId(id),
      owner: owner,
      type: type,
      direction: direction,
      section: section,
      title: d.text('title', max: 120, required: true),
      description: d.text('description', max: 1000),
      notes: d.text('notes'),
      currency: currency,
      originalAmount: original,
      paidAmount: paid,
      remainingAmount: remaining,
      defaultAmount: d.nullableMoney(
        'defaultAmountMinor',
        currency,
        positive: true,
      ),
      amountKind: d.enumeration('amountKind', AmountKind.values),
      originationDate: origination,
      timezone: d.timezone('timezone'),
      dueDate: due,
      nextDueDate: d.nullableDate('nextDueDate'),
      lifecycle: d.enumeration('lifecycle', ObligationLifecycle.values),
      status: d.enumeration('financialStatus', FinancialStatus.values),
      paymentMode: d.enumeration('paymentMode', PaymentMode.values),
      contactId: d.nullableText('contactId', max: 128) == null
          ? null
          : ContactId(d.text('contactId', max: 128)),
      contact: CatalogDto.contactLabel(d.nullableObject('contactSnapshot')),
      categoryId: CategoryId(d.text('categoryId', max: 128)),
      categoryName: d
          .object('categorySnapshot')
          .text('name', max: 80, required: true),
      paymentSourceId: d.nullableText('paymentSourceId', max: 128) == null
          ? null
          : SourceId(d.text('paymentSourceId', max: 128)),
      source: CatalogDto.sourceLabel(d.nullableObject('sourceSnapshot')),
      singleInstanceId: d.nullableText('singleInstanceId', max: 128) == null
          ? null
          : InstanceId(d.text('singleInstanceId', max: 128)),
      installmentInstanceIds: ids,
      interestInfo: interest == null
          ? null
          : InterestInfo(
              rateBasisPoints: interest.integer('rateBasisPoints', max: 100000),
              basis: interest.text('basis', max: 80, required: true),
              notes: interest.text('agreementNotes', max: 2000),
            ),
      archived: d.boolean('archived'),
      hasPaymentHistory: d.boolean('hasPaymentHistory'),
      revision: d.revision(),
      createdAt: d.dateTime('createdAt'),
      recurrence: recurrence,
      reminderPolicy: recurring
          ? RecurrenceDto.reminder(d.object('reminderPolicy'))
          : null,
      nextGenerationDate: recurring
          ? d.nullableDate('nextGenerationDate')
          : null,
    );
  }
}
