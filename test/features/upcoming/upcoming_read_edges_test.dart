import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/errors/app_failure.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/features/dashboard/data/summary_dto.dart';
import 'package:tally/features/activity/data/activity_dto.dart';
import 'package:tally/features/activity/domain/activity_entry.dart';
import 'package:tally/features/obligations/data/instance_dto.dart';
import 'package:tally/features/obligations/data/firestore_due_repository.dart';
import 'package:tally/features/obligations/domain/due_query.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';

import '../../support/upcoming_fixtures.dart';
import '../financial/financial_dto_test.dart' show audit;

void main() {
  final owner = OwnerUid('alice');
  test('a complete contact projection keeps seven native positions and rejects a wrong contact or missing bucket', () {
    final contact = ContactId('john');
    final raw = {
      ...summaryData(),
      'kind': 'contact',
      'contactId': 'john',
      'currencies': {
        for (final currency in CurrencyCode.values)
          currency.code: {
            'youOweMinor': 200000,
            'owedToYouMinor': 500000,
            'netPositionMinor': 300000,
            'activeCount': 2,
            'completedCount': 1,
            'cancelledCount': 0,
          },
      },
    };
    final result = SummaryDto.contact(
      contactSummaryId(contact),
      raw,
      owner,
      contact,
    );
    expect(result.currencies.length, 7);
    expect(result.currencies[CurrencyCode.php]!.netPosition.minorUnits, 300000);
    expect(
      result.currencies[CurrencyCode.usd]!.netPosition.currency,
      CurrencyCode.usd,
    );
    expect(
      () => SummaryDto.contact(
        contactSummaryId(contact),
        raw,
        owner,
        ContactId('jane'),
      ),
      throwsA(isA<AppFailure>()),
    );
    expect(
      () => SummaryDto.contact(
        contactSummaryId(contact),
        {...raw, 'currencies': {}},
        owner,
        contact,
      ),
      throwsA(isA<AppFailure>()),
    );
  });
  test('due residuals distinguish saved zones closed rows currency and variable amounts', () {
    final now = DateTime.utc(2026, 10, 4, 0, 1);
    final overdue = DueQuery(
      group: DueGroup.overdue,
      now: now,
      currency: CurrencyCode.php,
    );
    final hawaii = InstanceDto.fromMap(
      'hawaii',
      instanceData('hawaii', due: '2026-10-03', timezone: 'Pacific/Honolulu'),
      owner,
    );
    expect(overdue.matches(hawaii), isFalse);
    expect(DueQuery(group: DueGroup.today, now: now).matches(hawaii), isTrue);
    final soon = InstanceDto.fromMap(
      'soon',
      instanceData('soon', due: '2026-10-12', timezone: 'Pacific/Kiritimati'),
      owner,
    );
    expect(DueQuery(group: DueGroup.soon, now: now).matches(soon), isFalse);
    final unknown = InstanceDto.fromMap('variable', {
      ...instanceData('variable'),
      'amountMinor': null,
      'remainingMinor': null,
      'amountState': 'needed',
    }, owner);
    expect(DueQuery(group: DueGroup.today, now: now).matches(unknown), isTrue);
    final closed = InstanceDto.fromMap('paid', {
      ...instanceData('paid'),
      'totalPaidMinor': 10000,
      'remainingMinor': 0,
      'closed': true,
      'financialStatus': 'paid',
    }, owner);
    expect(DueQuery(group: DueGroup.today, now: now).matches(closed), isFalse);
    expect(
      DueQuery(
        group: DueGroup.today,
        now: now,
        currency: CurrencyCode.usd,
      ).matches(unknown),
      isFalse,
    );
  });
  test(
    'due continuation scanning reaches a match beyond forty residual pages',
    () async {
      final docs = UpcomingDocuments(owner);
      for (var i = 0; i < 40; i++) {
        docs.pages.add(
          RawPage(
            documents: [
              RawDocument('old-$i', instanceData('old-$i', due: '2026-09-01')),
            ],
            nextCursor: FixtureCursor(i + 1),
            hasMore: true,
            isFromCache: false,
          ),
        );
      }
      docs.pages.add(
        RawPage(
          documents: [RawDocument('due', instanceData('due'))],
          nextCursor: null,
          hasMore: false,
          isFromCache: false,
        ),
      );
      final page = await FirestoreDueRepository(
        docs,
        UpcomingCommands(owner),
      ).getDue(DueQuery(group: DueGroup.today, now: DateTime.utc(2026, 10, 4)));
      expect(page.items.single.id.value, 'due');
      expect(docs.queries.length, 41);
      expect(docs.queries.first.ranges.map((r) => r.value), [
        '2026-10-03',
        '2026-10-05',
      ]);
    },
  );
  test('activity maps unknown event kinds to a safe label but never accepts foreign ownership or unpaired money', () {
    final raw = {
      ...audit,
      'type': 'futureEvent',
      'title': 'Internet',
      'amountMinor': null,
      'currency': null,
      'obligationId': null,
      'recordedAt': DateTime.utc(2026, 10, 4),
    };
    expect(
      ActivityDto.fromMap('future', raw, owner).type,
      ActivityType.unknown,
    );
    expect(
      ActivityDto.fromMap('future', raw, owner).type.label,
      'Activity recorded',
    );
    expect(
      () => ActivityDto.fromMap('future', {...raw, 'userId': 'bob'}, owner),
      throwsA(isA<AppFailure>()),
    );
    expect(
      () => ActivityDto.fromMap('future', {...raw, 'currency': 'PHP'}, owner),
      throwsA(isA<AppFailure>()),
    );
  });
}
