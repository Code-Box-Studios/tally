import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/dates/local_date.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/features/obligations/data/instance_dto.dart';
import 'package:tally/features/obligations/data/obligation_dto.dart';
import 'package:tally/features/obligations/domain/obligation.dart';
import 'package:tally/features/search/domain/financial_filter.dart';

import '../../support/filter_fixtures.dart';
import '../../support/recurring_fixtures.dart';
import '../../support/upcoming_fixtures.dart' show instanceData;
import '../financial/financial_dto_test.dart' show obligationData;

void main() {
  test('legacy title-only instance snapshots remain readable without invented labels', () {
    final period = InstanceDto.fromMap(
      'legacy',
      instanceData('legacy'),
      OwnerUid('alice'),
    );
    expect(period.description, '');
    expect(period.notes, '');
    expect(period.contact, isNull);
    expect(period.categoryName, '');
  });
  final now = DateTime.utc(2026, 10, 5, 4);
  for (final status in [
    RecordStatus.pending,
    RecordStatus.partiallyPaid,
    RecordStatus.overdue,
  ]) {
    test('partial overdue bill matches ${status.name} independently', () {
      expect(
        FinancialFilter(status: status).matchesInstance(filterPeriod(), now),
        isTrue,
      );
    });
  }
  for (final (rawStatus, paid, remaining) in [
    ('paid', 54900, 0),
    ('skipped', 0, 54900),
    ('cancelled', 0, 54900),
  ]) {
    test('$rawStatus remains historical rather than overdue or pending', () {
      final period = filterPeriod(
        patch: {
          'financialStatus': rawStatus,
          'closed': true,
          'totalPaidMinor': paid,
          'remainingMinor': remaining,
        },
      );
      expect(
        FinancialFilter(status: RecordStatus.overdue)
            .matchesInstance(period, now),
        isFalse,
      );
      expect(
        FinancialFilter(status: RecordStatus.pending)
            .matchesInstance(period, now),
        isFalse,
      );
      expect(
        FinancialFilter(status: RecordStatus.values.byName(rawStatus))
            .matchesInstance(period, now),
        isTrue,
      );
    });
  }
  test('overdue is derived from the instance saved day, not cached status or UTC day', () {
    final period = filterPeriod(
      patch: {'timezone': 'America/Los_Angeles', 'dueDate': '2026-10-04'},
    );
    final filter = FinancialFilter(status: RecordStatus.overdue);
    expect(
      filter.matchesInstance(period, DateTime.utc(2026, 10, 5, 1)),
      isFalse,
    );
    expect(
      filter.matchesInstance(period, DateTime.utc(2026, 10, 5, 8)),
      isTrue,
    );
  });
  test('amount bounds use the original bill amount rather than remaining', () {
    expect(
      FinancialFilter(
        currency: CurrencyCode.php,
        minimumMinor: 54900,
        maximumMinor: 54900,
      ).matchesInstance(filterPeriod(), now),
      isTrue,
    );
    expect(
      FinancialFilter(
        currency: CurrencyCode.php,
        maximumMinor: 34900,
      ).matchesInstance(filterPeriod(), now),
      isFalse,
    );
    expect(
      FinancialFilter(
        currency: CurrencyCode.usd,
        minimumMinor: 54900,
      ).matchesInstance(filterPeriod(), now),
      isFalse,
    );
  });
  test('JPY amount bounds use its native integer minor units', () {
    final period = filterPeriod(
      patch: {
        'currency': 'JPY',
        'amountMinor': 549,
        'totalPaidMinor': 200,
        'remainingMinor': 349,
      },
    );
    expect(
      FinancialFilter(
        currency: CurrencyCode.jpy,
        minimumMinor: 549,
        maximumMinor: 549,
      ).matchesInstance(period, now),
      isTrue,
    );
  });
  test(
    'unknown bills remain pending while estimates never satisfy amount filters',
    () {
      final raw = recurringData('variable'),
          period = InstanceDto.fromMap(
            raw['instanceId'] as String,
            raw,
            recurringOwner,
          );
      expect(
        FinancialFilter(status: RecordStatus.pending)
            .matchesInstance(period, now),
        isTrue,
      );
      expect(
        FinancialFilter(
          currency: CurrencyCode.php,
          minimumMinor: 0,
        ).matchesInstance(period, now),
        isFalse,
      );
    },
  );
  final selectors = <String, (FinancialFilter, FinancialFilter)>{
    'section': (
      FinancialFilter(section: ObligationSection.monthlyDues),
      FinancialFilter(section: ObligationSection.iOwe),
    ),
    'person': (
      FinancialFilter(contactId: ContactId('john')),
      FinancialFilter(contactId: ContactId('jane')),
    ),
    'category': (
      FinancialFilter(categoryId: CategoryId('utilities')),
      FinancialFilter(categoryId: CategoryId('rent')),
    ),
    'source': (
      FinancialFilter(sourceId: SourceId('card')),
      FinancialFilter(sourceId: SourceId('cash')),
    ),
    'mode': (
      FinancialFilter(paymentMode: PaymentMode.automatic),
      FinancialFilter(paymentMode: PaymentMode.manual),
    ),
  };
  for (final entry in selectors.entries) {
    test('${entry.key} selector evaluates the stored stable value', () {
      expect(entry.value.$1.matchesInstance(filterPeriod(), now), isTrue);
      expect(entry.value.$2.matchesInstance(filterPeriod(), now), isFalse);
    });
  }
  test(
    'automatic selector includes both automatic behaviors and excludes manual',
    () {
      final filter = FinancialFilter(automaticOnly: true);
      expect(filter.matchesInstance(filterPeriod(), now), isTrue);
      expect(
        filter.matchesInstance(
          filterPeriod(patch: {'paymentMode': 'automaticConfirmation'}),
          now,
        ),
        isTrue,
      );
      expect(
        filter.matchesInstance(
          filterPeriod(
            patch: {'paymentMode': 'manual', 'deductionStatus': null},
          ),
          now,
        ),
        isFalse,
      );
    },
  );
  for (final text in [
    'INTERNET',
    ' home   connection ',
    'REFERENCE abc',
    ' john   SMITH ',
    'UTILITIES',
  ]) {
    test('search finds normalized $text in actual saved fields', () {
      expect(
        FinancialFilter(text: text).matchesInstance(filterPeriod(), now),
        isTrue,
      );
      expect(
        FinancialFilter(text: 'absent').matchesInstance(filterPeriod(), now),
        isFalse,
      );
    });
  }
  test('organization snapshot and explicit period notes are searchable', () {
    final raw = recurringData('scheduled');
    raw['snapshot'] = {
      ...raw['snapshot'] as Map<String, Object?>,
      'contactSnapshot': {
        'kind': 'organization',
        'displayName': 'Metro School',
      },
    };
    raw['notes'] = 'Updated reference';
    final period = InstanceDto.fromMap(
      raw['instanceId'] as String,
      raw,
      recurringOwner,
    );
    expect(
      FinancialFilter(text: 'METRO school').matchesInstance(period, now),
      isTrue,
    );
    expect(
      FinancialFilter(text: 'updated reference').matchesInstance(period, now),
      isTrue,
    );
  });
  test(
    'date range is inclusive and uses the due label, not the period identity',
    () {
      final period = filterPeriod(patch: {'dueDate': '2026-10-10'});
      expect(
        FinancialFilter(
          firstDate: LocalDate.parse('2026-10-10'),
          lastDate: LocalDate.parse('2026-10-10'),
        ).matchesInstance(period, now),
        isTrue,
      );
      expect(
        FinancialFilter(lastDate: LocalDate.parse('2026-10-04'))
            .matchesInstance(period, now),
        isFalse,
      );
    },
  );
  test('recurring bill search uses its fee and lifecycle but not payment status or generation date', () {
    final raw = recurringData('parent'),
        parent = ObligationDto.fromMap(
          raw['obligationId'] as String,
          raw,
          recurringOwner,
        );
    expect(
      FinancialFilter(
        currency: CurrencyCode.php,
        minimumMinor: 54900,
        maximumMinor: 54900,
      ).matchesObligation(parent, now),
      isTrue,
    );
    expect(
      FinancialFilter(lifecycle: ObligationLifecycle.paused)
          .matchesObligation(parent, now),
      isFalse,
    );
    expect(
      FinancialFilter(status: RecordStatus.pending)
          .matchesObligation(parent, now),
      isFalse,
    );
    expect(
      FinancialFilter(firstDate: LocalDate.parse('2026-10-01'))
          .matchesObligation(parent, now),
      isFalse,
    );
  });
  test(
    'finite parent filtering uses original principal and next unpaid due date',
    () {
      final raw = {...obligationData(), 'nextDueDate': '2026-11-01'},
          parent = ObligationDto.fromMap('loan-1', raw, OwnerUid('alice'));
      expect(
        FinancialFilter(
          currency: CurrencyCode.php,
          minimumMinor: 1000000,
          firstDate: LocalDate.parse('2026-11-01'),
        ).matchesObligation(parent, now),
        isTrue,
      );
      expect(
        FinancialFilter(status: RecordStatus.overdue)
            .matchesObligation(parent, now),
        isFalse,
      );
      expect(
        FinancialFilter(lastDate: LocalDate.parse('2026-10-31'))
            .matchesObligation(parent, now),
        isFalse,
      );
    },
  );
  final invalid = <String, FinancialFilter Function()>{
    'missing money currency': () => FinancialFilter(minimumMinor: 1),
    'negative money': () =>
        FinancialFilter(currency: CurrencyCode.php, minimumMinor: -1),
    'too large money': () => FinancialFilter(
      currency: CurrencyCode.php,
      maximumMinor: 1000000000001,
    ),
    'reversed money': () => FinancialFilter(
      currency: CurrencyCode.php,
      minimumMinor: 100,
      maximumMinor: 99,
    ),
    'reversed dates': () => FinancialFilter(
      firstDate: LocalDate.parse('2026-11-01'),
      lastDate: LocalDate.parse('2026-10-31'),
    ),
    'conflicting mode': () =>
        FinancialFilter(automaticOnly: true, paymentMode: PaymentMode.manual),
    'oversized search': () => FinancialFilter(text: 'x' * 241),
  };
  for (final entry in invalid.entries) {
    test(
      '${entry.key} fails before querying',
      () => expect(entry.value, throwsArgumentError),
    );
  }
  test('normalized equivalent criteria have stable equality', () {
    final first = FinancialFilter(
      text: ' John  Smith ',
      currency: CurrencyCode.php,
      minimumMinor: 0,
    );
    final second = FinancialFilter(
      text: 'john smith',
      currency: CurrencyCode.php,
      minimumMinor: 0,
    );
    expect(first, second);
    expect(first.hashCode, second.hashCode);
    expect(
      first,
      isNot(
        FinancialFilter(
          text: 'john smith',
          currency: CurrencyCode.usd,
          minimumMinor: 0,
        ),
      ),
    );
  });
}
