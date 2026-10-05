import '../../../core/dates/local_date.dart';
import '../../../core/dates/timezone_catalog.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../../../core/money/money.dart';
import '../../obligations/domain/obligation.dart';
import '../../obligations/domain/obligation_instance.dart';

enum RecordStatus {
  all,
  pending,
  partiallyPaid,
  paid,
  overdue,
  skipped,
  cancelled,
}

final class FinancialFilter {
  FinancialFilter({
    this.section,
    this.status = RecordStatus.all,
    this.currency,
    this.contactId,
    this.categoryId,
    this.sourceId,
    this.paymentMode,
    this.automaticOnly = false,
    this.minimumMinor,
    this.maximumMinor,
    this.firstDate,
    this.lastDate,
    this.lifecycle,
    String text = '',
  }) : text = normalizeText(text) {
    if (this.text.runes.length > 240 ||
        automaticOnly && paymentMode != null ||
        (minimumMinor != null || maximumMinor != null) && currency == null ||
        [
          minimumMinor,
          maximumMinor,
        ].any((v) => v != null && (v < 0 || v > 1000000000000)) ||
        minimumMinor != null &&
            maximumMinor != null &&
            minimumMinor! > maximumMinor! ||
        firstDate != null &&
            lastDate != null &&
            firstDate!.compareTo(lastDate!) > 0) {
      throw ArgumentError(
        'Choose valid search text, dates and one currency for amount bounds.',
      );
    }
  }

  static String normalizeText(String value) =>
      value.trim().replaceAll(RegExp(r'\s+'), ' ').toLowerCase();
  final ObligationSection? section;
  final RecordStatus status;
  final CurrencyCode? currency;
  final ContactId? contactId;
  final CategoryId? categoryId;
  final SourceId? sourceId;
  final PaymentMode? paymentMode;
  final bool automaticOnly;
  final int? minimumMinor, maximumMinor;
  final LocalDate? firstDate, lastDate;
  final ObligationLifecycle? lifecycle;
  final String text;

  bool get usesPeriodState =>
      status != RecordStatus.all || firstDate != null || lastDate != null;

  FinancialFilter withDates(LocalDate? first, LocalDate? last) =>
      FinancialFilter(
        section: section,
        status: status,
        currency: currency,
        contactId: contactId,
        categoryId: categoryId,
        sourceId: sourceId,
        paymentMode: paymentMode,
        automaticOnly: automaticOnly,
        minimumMinor: minimumMinor,
        maximumMinor: maximumMinor,
        firstDate: first,
        lastDate: last,
        lifecycle: lifecycle,
        text: text,
      );

  bool _fieldsMatch({
    required ObligationSection section,
    required CurrencyCode currency,
    required ContactId? contactId,
    required CategoryId categoryId,
    required SourceId? sourceId,
    required PaymentMode mode,
    required Money? amount,
    required LocalDate? due,
    required Iterable<String?> fields,
  }) {
    if (this.section != null && this.section != section ||
        this.currency != null && this.currency != currency ||
        this.contactId != null && this.contactId != contactId ||
        this.categoryId != null && this.categoryId != categoryId ||
        this.sourceId != null && this.sourceId != sourceId ||
        paymentMode != null && paymentMode != mode ||
        automaticOnly && mode == PaymentMode.manual) {
      return false;
    }
    if (minimumMinor != null || maximumMinor != null) {
      if (amount == null ||
          amount.currency != currency ||
          minimumMinor != null && amount.minorUnits < minimumMinor! ||
          maximumMinor != null && amount.minorUnits > maximumMinor!) {
        return false;
      }
    }
    if (firstDate != null || lastDate != null) {
      if (due == null ||
          firstDate != null && due.compareTo(firstDate!) < 0 ||
          lastDate != null && due.compareTo(lastDate!) > 0) {
        return false;
      }
    }
    return text.isEmpty ||
        fields.any(
          (field) => field != null && normalizeText(field).contains(text),
        );
  }

  bool _statusMatches({
    required bool closed,
    required FinancialStatus stored,
    required int paid,
    required int? remaining,
    required LocalDate? due,
    required String zone,
    required DateTime now,
  }) {
    final cancelled = stored == FinancialStatus.cancelled,
        skipped = stored == FinancialStatus.skipped,
        outstanding = !closed && !cancelled && !skipped && remaining != 0;
    return switch (status) {
      RecordStatus.all => true,
      RecordStatus.pending => outstanding,
      RecordStatus.partiallyPaid => outstanding && paid > 0,
      RecordStatus.paid => !cancelled && !skipped && remaining == 0,
      RecordStatus.overdue =>
        outstanding && due != null && _overdue(due, zone, now),
      RecordStatus.skipped => skipped,
      RecordStatus.cancelled => cancelled,
    };
  }

  static bool _overdue(LocalDate due, String zone, DateTime now) {
    final local = TimezoneCatalog.at(now.toUtc(), zone);
    return DateTime.utc(
      due.year,
      due.month,
      due.day,
    ).isBefore(DateTime.utc(local.year, local.month, local.day));
  }

  bool matchesInstance(ObligationInstance instance, DateTime now) =>
      lifecycle == null &&
      _fieldsMatch(
        section: instance.section,
        currency: instance.currency,
        contactId: instance.contactId,
        categoryId: instance.categoryId,
        sourceId: instance.paymentSourceId,
        mode: instance.paymentMode,
        amount: instance.amount,
        due: instance.dueDate,
        fields: [
          instance.title,
          instance.description,
          instance.notes,
          instance.contact?.name,
          instance.categoryName,
        ],
      ) &&
      _statusMatches(
        closed: instance.closed,
        stored: instance.status,
        paid: instance.paidAmount.minorUnits,
        remaining: instance.remainingAmount?.minorUnits,
        due: instance.dueDate,
        zone: instance.timezone,
        now: now,
      );

  bool matchesObligation(Obligation obligation, DateTime now) {
    if (lifecycle != null && lifecycle != obligation.lifecycle ||
        obligation.isRecurring && usesPeriodState) {
      return false;
    }
    final due = obligation.nextDueDate ?? obligation.dueDate;
    final amount = obligation.isRecurring
        ? obligation.amountKind == AmountKind.fixed
              ? obligation.defaultAmount
              : null
        : obligation.originalAmount;
    return _fieldsMatch(
          section: obligation.section,
          currency: obligation.currency,
          contactId: obligation.contactId,
          categoryId: obligation.categoryId,
          sourceId: obligation.paymentSourceId,
          mode: obligation.paymentMode,
          amount: amount,
          due: due,
          fields: [
            obligation.title,
            obligation.description,
            obligation.notes,
            obligation.contact?.name,
            obligation.categoryName,
          ],
        ) &&
        (obligation.isRecurring ||
            _statusMatches(
              closed:
                  obligation.lifecycle == ObligationLifecycle.cancelled ||
                  obligation.remainingAmount?.minorUnits == 0,
              stored: obligation.lifecycle == ObligationLifecycle.cancelled
                  ? FinancialStatus.cancelled
                  : obligation.status,
              paid: obligation.paidAmount?.minorUnits ?? 0,
              remaining: obligation.remainingAmount?.minorUnits,
              due: due,
              zone: obligation.timezone,
              now: now,
            ));
  }

  List<Object?> get _values => [
    section,
    status,
    currency,
    contactId,
    categoryId,
    sourceId,
    paymentMode,
    automaticOnly,
    minimumMinor,
    maximumMinor,
    firstDate,
    lastDate,
    lifecycle,
    text,
  ];
  @override
  bool operator ==(Object other) {
    if (other is! FinancialFilter) return false;
    final left = _values, right = other._values;
    for (var i = 0; i < left.length; i++) {
      if (left[i] != right[i]) return false;
    }
    return true;
  }

  @override
  int get hashCode => Object.hashAll(_values);
}
