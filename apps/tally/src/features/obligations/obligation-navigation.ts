import { currencies } from "../../core/domain/money";
import { amount, text, type Row } from "../../core/domain/records";

export function overviewFilters(params: Record<string, unknown>) {
  const select = (value: unknown, allowed: readonly string[]) =>
    typeof value === "string" && allowed.includes(value) ? value : "all";
  return {
    section: select(params.section, [
      "all",
      "payable",
      "iOwe",
      "owedToMe",
      "monthlyDues",
    ]),
    currency: select(params.currency, currencies),
    status: select(params.status, [
      "all",
      "outstanding",
      "overdue",
      "pending",
      "active",
      "partiallyPaid",
      "paid",
      "cancelled",
      "skipped",
      "paused",
      "ended",
    ]),
  };
}

export function outstandingPeriod(row: Row) {
  return (
    row.data.closed !== true &&
    !["cancelled", "skipped"].includes(text(row.data, "financialStatus")) &&
    ((amount(row.data, "remainingMinor") ?? 0) > 0 ||
      (row.data.section === "monthlyDues" &&
        amount(row.data, "remainingMinor") === null))
  );
}

export function periodDestination(row: Row) {
  return {
    pathname: "/obligations/[id]" as const,
    params: { id: text(row.data, "obligationId"), instanceId: row.id },
  };
}
