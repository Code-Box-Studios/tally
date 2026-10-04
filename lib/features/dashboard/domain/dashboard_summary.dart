import '../../../core/identifiers/entity_ids.dart';
import '../../../core/dates/timezone_catalog.dart';
import '../../auth/domain/user_profile.dart';
import '../../../core/dates/local_date.dart';
import '../../../core/dates/year_month.dart';
import '../../../core/errors/app_failure.dart';
import '../../../core/money/currency_code.dart';
import '../../../core/money/money.dart';

enum PreviewSection { owedByMe, owedToMe, recurringDue }

enum PreviewDueState { upcoming, dueToday, overdue, paid, expected, failed }

final class DashboardQuery {
  const DashboardQuery({required this.currency, required this.month});
  final CurrencyCode currency;
  final YearMonth month;
  @override
  bool operator ==(Object other) =>
      other is DashboardQuery &&
      other.currency == currency &&
      other.month == month;
  @override
  int get hashCode => Object.hash(currency, month);
}

final class DuePreviewItem {
  const DuePreviewItem({
    required this.title,
    required this.dueDate,
    required this.remaining,
    required this.section,
    required this.state,
    this.automatic = false,
    this.assumed = false,
  });
  final String title;
  final LocalDate dueDate;
  final Money? remaining;
  final PreviewSection section;
  final PreviewDueState state;
  final bool automatic;
  final bool assumed;
}

final class DashboardSummary {
  DashboardSummary({
    required this.currency,
    required this.month,
    required this.asOfDate,
    required this.youOwe,
    required this.owedToYou,
    required this.dueThisMonth,
    required this.paidThisMonth,
    required this.remainingThisMonth,
    required this.overdue,
    required List<DuePreviewItem> upcoming,
  }) : upcoming = List.unmodifiable(upcoming) {
    for (final value in [
      youOwe,
      owedToYou,
      dueThisMonth,
      paidThisMonth,
      remainingThisMonth,
      overdue,
      ...upcoming.map((item) => item.remaining).whereType<Money>(),
    ]) {
      if (value.currency != currency) {
        throw AppFailure(
          AppFailureCode.currencyMismatch,
          messageKey: 'money.currencyMismatch',
        );
      }
      if (value.minorUnits < 0) {
        throw AppFailure(
          AppFailureCode.invalidAmount,
          messageKey: 'money.nonnegativeRequired',
        );
      }
    }
  }
  final CurrencyCode currency;
  final YearMonth month;
  final LocalDate asOfDate;
  final Money youOwe,
      owedToYou,
      dueThisMonth,
      paidThisMonth,
      remainingThisMonth,
      overdue;
  final List<DuePreviewItem> upcoming;
  Money get netPosition => owedToYou.subtract(youOwe);
}

enum SummaryFreshness { current, cached, updating }

final class LedgerState {
  const LedgerState({
    required this.owner,
    required this.revision,
    required this.formulaVersion,
  });
  final OwnerUid owner;
  final int revision, formulaVersion;
}

final class ProjectionMetadata {
  const ProjectionMetadata({
    required this.owner,
    required this.sourceRevision,
    required this.profileRevision,
    required this.formulaVersion,
    required this.month,
    required this.timezone,
    required this.financialDay,
    required this.computedAt,
    required this.validUntil,
  });
  final OwnerUid owner;
  final int sourceRevision, profileRevision, formulaVersion;
  final YearMonth month;
  final String timezone;
  final LocalDate financialDay;
  final DateTime computedAt, validUntil;
  SummaryFreshness freshness({
    required LedgerState ledger,
    required UserProfile profile,
    required DateTime now,
    bool isFromCache = false,
    bool ledgerIsFromCache = false,
  }) {
    if (ledger.owner != owner || profile.uid != owner) {
      throw AppFailure(
        AppFailureCode.unavailable,
        messageKey: 'data.unsupportedOrInvalid',
      );
    }
    final local = TimezoneCatalog.at(now, profile.timezone);
    final today = LocalDate.fromParts(local.year, local.month, local.day);
    if (sourceRevision != ledger.revision ||
        profileRevision != profile.revision ||
        formulaVersion != 1 ||
        ledger.formulaVersion != 1 ||
        timezone != profile.timezone ||
        month != today.yearMonth ||
        financialDay != today ||
        !now.isBefore(validUntil)) {
      return SummaryFreshness.updating;
    }
    return isFromCache || ledgerIsFromCache
        ? SummaryFreshness.cached
        : SummaryFreshness.current;
  }
}

final class MonthTotals {
  const MonthTotals({
    required this.scheduled,
    required this.remaining,
    required this.paid,
    required this.assumedPaid,
    required this.confirmedPaid,
    required this.unknownAmountCount,
  });
  final Money scheduled, remaining, paid, assumedPaid, confirmedPaid;
  final int unknownAmountCount;
}

final class AttentionTotals {
  const AttentionTotals({
    required this.amount,
    required this.count,
    required this.unknownAmountCount,
  });
  final Money amount;
  final int count, unknownAmountCount;
}

final class DirectionTotals<T> {
  const DirectionTotals({required this.outgoing, required this.incoming});
  final T outgoing, incoming;
}

final class DashboardAttention {
  const DashboardAttention({
    required this.dueToday,
    required this.dueSoon,
    required this.overdue,
  });
  final DirectionTotals<AttentionTotals> dueToday, dueSoon, overdue;
}

/// Canonical per-currency record. Preview samples use DashboardSummary above.
final class ProjectedDashboardSummary {
  const ProjectedDashboardSummary({
    required this.currency,
    required this.metadata,
    required this.youOwe,
    required this.owedToYou,
    required this.netPosition,
    required this.recurringOutstanding,
    required this.unknownAmountCount,
    required this.month,
    required this.attention,
  });
  final CurrencyCode currency;
  final ProjectionMetadata metadata;
  final Money youOwe, owedToYou, netPosition, recurringOutstanding;
  final int unknownAmountCount;
  final DirectionTotals<MonthTotals> month;
  final DashboardAttention attention;
  SummaryFreshness freshness({
    required LedgerState ledger,
    required UserProfile profile,
    required DateTime now,
    bool isFromCache = false,
    bool ledgerIsFromCache = false,
  }) => metadata.freshness(
    ledger: ledger,
    profile: profile,
    now: now,
    isFromCache: isFromCache,
    ledgerIsFromCache: ledgerIsFromCache,
  );
}

final class ContactCurrencyPosition {
  const ContactCurrencyPosition({
    required this.currency,
    required this.youOwe,
    required this.owedToYou,
    required this.netPosition,
    required this.activeCount,
    required this.completedCount,
    required this.cancelledCount,
  });
  final CurrencyCode currency;
  final Money youOwe, owedToYou, netPosition;
  final int activeCount, completedCount, cancelledCount;
}

final class ProjectedContactSummary {
  ProjectedContactSummary({
    required this.contactId,
    required this.metadata,
    required Map<CurrencyCode, ContactCurrencyPosition> currencies,
  }) : currencies = Map.unmodifiable(currencies);
  final ContactId contactId;
  final ProjectionMetadata metadata;
  final Map<CurrencyCode, ContactCurrencyPosition> currencies;
}
