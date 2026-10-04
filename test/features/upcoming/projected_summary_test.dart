import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/core/errors/app_failure.dart';
import 'package:tally/features/auth/domain/user_profile.dart';
import 'package:tally/features/dashboard/data/summary_dto.dart';
import 'package:tally/features/dashboard/domain/dashboard_summary.dart';
import 'package:tally/features/dashboard/data/firestore_dashboard_repository.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';

import '../../support/upcoming_fixtures.dart';

UserProfile profile({String timezone = 'Asia/Manila', int revision = 1}) =>
    UserProfile(
      uid: OwnerUid('alice'),
      displayName: 'Alice',
      photoUrl: null,
      defaultCurrency: CurrencyCode.php,
      timezone: timezone,
      locale: 'en',
      theme: ProfileTheme.system,
      onboardingComplete: true,
      revision: revision,
    );
void main() {
  final owner = OwnerUid('alice');
  final instant = DateTime.utc(2026, 10, 4, 4);
  test('projected summary preserves monthly independence and signed native-currency position', () {
    final summary = SummaryDto.dashboard('dashboard-PHP', summaryData(), owner);
    expect(summary.youOwe.minorUnits, 2500000);
    expect(summary.netPosition.minorUnits, -1250000);
    expect(summary.month.outgoing.scheduled.minorUnits, 875000);
    expect(summary.month.outgoing.paid.minorUnits, 950000);
    expect(summary.month.outgoing.remaining.minorUnits, 225000);
    expect(summary.unknownAmountCount, 2);
    final usd = SummaryDto.dashboard(
      'dashboard-USD',
      summaryData(currency: 'USD'),
      owner,
    );
    expect(usd.currency, CurrencyCode.usd);
    expect(() => summary.youOwe.add(usd.youOwe), throwsA(isA<AppFailure>()));
  });
  test('freshness rejects old ledger profile month timezone day formula and saved-zone validity', () {
    final ledger = LedgerState(owner: owner, revision: 4, formulaVersion: 1);
    final summary = SummaryDto.dashboard('dashboard-PHP', summaryData(), owner);
    expect(
      summary.freshness(ledger: ledger, profile: profile(), now: instant),
      SummaryFreshness.current,
    );
    expect(
      summary.freshness(
        ledger: ledger,
        profile: profile(),
        now: instant,
        isFromCache: true,
      ),
      SummaryFreshness.cached,
    );
    for (final patch in <Map<String, Object?>>[
      {'sourceRevision': 3},
      {'profileRevision': 2},
      {'yearMonth': '2026-09'},
      {'timezone': 'Pacific/Honolulu'},
      {'financialDay': '2026-10-03'},
      {'formulaVersion': 2},
      {'validUntil': DateTime.utc(2026, 10, 4, 3)},
    ]) {
      final stale = SummaryDto.dashboard('dashboard-PHP', {
        ...summaryData(),
        ...patch,
      }, owner);
      expect(
        stale.freshness(ledger: ledger, profile: profile(), now: instant),
        SummaryFreshness.updating,
      );
    }
    expect(
      summary.freshness(
        ledger: ledger,
        profile: profile(timezone: 'Pacific/Honolulu', revision: 2),
        now: instant,
      ),
      SummaryFreshness.updating,
    );
    expect(
      summary.freshness(
        ledger: ledger,
        profile: profile(),
        now: DateTime.utc(2026, 10, 4, 16),
      ),
      SummaryFreshness.updating,
    );
    expect(
      () => summary.freshness(
        ledger: LedgerState(
          owner: OwnerUid('bob'),
          revision: 4,
          formulaVersion: 1,
        ),
        profile: profile(),
        now: instant,
      ),
      throwsA(isA<AppFailure>()),
    );
  });
  test('summary DTO rejects forged ownership currency inconsistent net and unsafe money', () {
    for (final patch in <Map<String, Object?>>[
      {'userId': 'bob'},
      {'currency': 'USD'},
      {'youOweMinor': -1},
      {'netPositionMinor': 0},
      {'youOweMinor': 9007199254740992},
    ]) {
      expect(
        () => SummaryDto.dashboard('dashboard-PHP', {
          ...summaryData(),
          ...patch,
        }, owner),
        throwsA(isA<AppFailure>()),
      );
    }
  });
  test('owned dashboard repository retains absent/cache metadata and sends the captured owner command', () async {
    final documents = UpcomingDocuments(owner);
    final commands = UpcomingCommands(owner)..response = {'accepted': true};
    final repository = FirestoreDashboardRepository(documents, commands);
    expect(
      (await repository.watchSummary(CurrencyCode.php).first).value,
      isNull,
    );
    documents.records['summaries/dashboard-PHP'] = RawRecord(
      RawDocument('dashboard-PHP', summaryData()),
      isFromCache: true,
    );
    expect(
      (await repository.watchSummary(CurrencyCode.php).first).isFromCache,
      isTrue,
    );
    await repository.refresh(CommandId('refresh-1'));
    expect(commands.calls.single.name, 'refreshDashboard');
    expect(commands.calls.single.payload, isEmpty);
    expect(
      () => FirestoreDashboardRepository(
        documents,
        UpcomingCommands(OwnerUid('bob')),
      ),
      throwsArgumentError,
    );
  });
}
