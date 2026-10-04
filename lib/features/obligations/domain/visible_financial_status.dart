import '../../../core/dates/local_date.dart';
import '../../../core/dates/timezone_catalog.dart';
import 'obligation.dart';

FinancialStatus visibleFinancialStatus(Obligation parent, DateTime now) {
  if (parent.lifecycle == ObligationLifecycle.cancelled) {
    return FinancialStatus.cancelled;
  }
  if (parent.isRecurring) return parent.status;
  if (parent.remainingAmount?.minorUnits == 0) return FinancialStatus.paid;
  final local = TimezoneCatalog.at(now, parent.timezone);
  final today = LocalDate.fromParts(local.year, local.month, local.day);
  final due = parent.nextDueDate ?? parent.dueDate;
  if (due != null && due.compareTo(today) < 0) return FinancialStatus.overdue;
  return (parent.paidAmount?.minorUnits ?? 0) > 0
      ? FinancialStatus.partiallyPaid
      : FinancialStatus.pending;
}
