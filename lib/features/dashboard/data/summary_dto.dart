import 'dart:convert';

import 'package:crypto/crypto.dart';

import '../../../core/dates/year_month.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../../../core/money/money.dart';
import '../../../shared/data/document_reader.dart';
import '../domain/dashboard_summary.dart';

String contactSummaryId(ContactId id) =>
    'contact-${sha256.convert(utf8.encode(id.value))}';

abstract final class SummaryDto {
  static Money _amount(
    DocumentReader d,
    String key,
    CurrencyCode currency, {
    bool signed = false,
  }) => Money.fromMinorUnits(
    d.integer(key, min: signed ? -9007199254740991 : 0),
    currency,
  );
  static ProjectionMetadata _metadata(DocumentReader d, OwnerUid owner) =>
      ProjectionMetadata(
        owner: owner,
        sourceRevision: d.integer('sourceRevision'),
        profileRevision: d.integer('profileRevision', min: 1),
        formulaVersion: d.integer('formulaVersion', min: 1),
        month: YearMonth.parse(d.text('yearMonth', max: 7)),
        timezone: d.timezone('timezone'),
        financialDay: d.date('financialDay'),
        computedAt: d.dateTime('computedAt'),
        validUntil: d.dateTime('validUntil'),
      );
  static MonthTotals _month(DocumentReader d, CurrencyCode currency) {
    final result = MonthTotals(
      scheduled: _amount(d, 'scheduledMinor', currency),
      remaining: _amount(d, 'remainingMinor', currency),
      paid: _amount(d, 'paidMinor', currency),
      assumedPaid: _amount(d, 'assumedPaidMinor', currency),
      confirmedPaid: _amount(d, 'confirmedPaidMinor', currency),
      unknownAmountCount: d.integer('unknownAmountCount'),
    );
    if (result.remaining.minorUnits > result.scheduled.minorUnits ||
        result.assumedPaid.add(result.confirmedPaid) != result.paid) {
      throw DocumentReader.invalid();
    }
    return result;
  }

  static AttentionTotals _attention(DocumentReader d, CurrencyCode currency) {
    final result = AttentionTotals(
      amount: _amount(d, 'amountMinor', currency),
      count: d.integer('count'),
      unknownAmountCount: d.integer('unknownAmountCount'),
    );
    if (result.unknownAmountCount > result.count) {
      throw DocumentReader.invalid();
    }
    return result;
  }

  static DirectionTotals<T> _directions<T>(
    DocumentReader d,
    T Function(DocumentReader) convert,
  ) => DirectionTotals(
    outgoing: convert(d.object('outgoing')),
    incoming: convert(d.object('incoming')),
  );
  static ProjectedDashboardSummary dashboard(
    String id,
    Map<String, Object?> raw,
    OwnerUid owner,
  ) {
    try {
      final d = DocumentReader(raw)..owner(owner);
      final currency = CurrencyCode.parse(d.text('currency', max: 3));
      if (id != 'dashboard-${currency.code}' || d.text('kind') != 'dashboard') {
        throw DocumentReader.invalid();
      }
      final youOwe = _amount(d, 'youOweMinor', currency);
      final owedToYou = _amount(d, 'owedToYouMinor', currency);
      final net = _amount(d, 'netPositionMinor', currency, signed: true);
      if (owedToYou.subtract(youOwe) != net) throw DocumentReader.invalid();
      final attention = d.object('attention');
      DirectionTotals<AttentionTotals> group(String key) => _directions(
        attention.object(key),
        (value) => _attention(value, currency),
      );
      return ProjectedDashboardSummary(
        currency: currency,
        metadata: _metadata(d, owner),
        youOwe: youOwe,
        owedToYou: owedToYou,
        netPosition: net,
        recurringOutstanding: _amount(d, 'recurringOutstandingMinor', currency),
        unknownAmountCount: d.integer('unknownAmountCount'),
        month: _directions(
          d.object('month'),
          (value) => _month(value, currency),
        ),
        attention: DashboardAttention(
          dueToday: group('dueToday'),
          dueSoon: group('dueSoon'),
          overdue: group('overdue'),
        ),
      );
    } catch (_) {
      throw DocumentReader.invalid();
    }
  }

  static LedgerState ledger(
    String id,
    Map<String, Object?> raw,
    OwnerUid owner,
  ) {
    final d = DocumentReader(raw)..owner(owner);
    if (id != 'current') throw DocumentReader.invalid();
    return LedgerState(
      owner: owner,
      revision: d.integer('revision'),
      formulaVersion: d.integer('formulaVersion', min: 1),
    );
  }

  static ProjectedContactSummary contact(
    String id,
    Map<String, Object?> raw,
    OwnerUid owner,
    ContactId expected,
  ) {
    try {
      final d = DocumentReader(raw)..owner(owner);
      if (id != contactSummaryId(expected) ||
          d.text('contactId', max: 128) != expected.value ||
          d.text('kind') != 'contact') {
        throw DocumentReader.invalid();
      }
      final currencies = d.object('currencies');
      if (currencies.data.length != CurrencyCode.values.length ||
          currencies.data.keys.any(
            (code) =>
                !CurrencyCode.values.any((currency) => currency.code == code),
          )) {
        throw DocumentReader.invalid();
      }
      final result = <CurrencyCode, ContactCurrencyPosition>{};
      for (final currency in CurrencyCode.values) {
        final bucket = currencies.object(currency.code);
        final youOwe = _amount(bucket, 'youOweMinor', currency);
        final owedToYou = _amount(bucket, 'owedToYouMinor', currency);
        final net = _amount(bucket, 'netPositionMinor', currency, signed: true);
        if (owedToYou.subtract(youOwe) != net) throw DocumentReader.invalid();
        result[currency] = ContactCurrencyPosition(
          currency: currency,
          youOwe: youOwe,
          owedToYou: owedToYou,
          netPosition: net,
          activeCount: bucket.integer('activeCount'),
          completedCount: bucket.integer('completedCount'),
          cancelledCount: bucket.integer('cancelledCount'),
        );
      }
      return ProjectedContactSummary(
        contactId: expected,
        metadata: _metadata(d, owner),
        currencies: result,
      );
    } catch (_) {
      throw DocumentReader.invalid();
    }
  }
}
