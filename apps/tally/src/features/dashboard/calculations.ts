import { addDays } from "../../core/domain/date";
import { text, amount, type Row } from "../../core/domain/records";
import { currency, type Currency } from "../../core/domain/money";
export interface CurrencySummary {
  owe: number;
  owed: number;
  net: number;
  dueMonth: number;
  paidMonth: number;
  remainingMonth: number;
  overdue: number;
  dueToday: number;
  dueSoon: number;
}
export function summaries(
  obligations: Row[],
  instances: Row[],
  payments: Row[],
  today: string,
): Partial<Record<Currency, CurrencySummary>> {
  const totals: Partial<Record<Currency, CurrencySummary>> = {};
  const get = (code: string) => {
    const c = currency(code);
    return (
      totals[c] ??
      (totals[c] = {
        owe: 0,
        owed: 0,
        net: 0,
        dueMonth: 0,
        paidMonth: 0,
        remainingMonth: 0,
        overdue: 0,
        dueToday: 0,
        dueSoon: 0,
      })
    );
  };
  for (const { data: d } of obligations) {
    if (
      d.lifecycle === "cancelled" ||
      d.archived === true ||
      d.section === "monthlyDues"
    )
      continue;
    const t = get(text(d, "currency"));
    if (d.section === "iOwe") t.owe += amount(d, "remainingMinor") ?? 0;
    else if (d.section === "owedToMe")
      t.owed += amount(d, "remainingMinor") ?? 0;
  }
  for (const { data: d } of instances) {
    if (["cancelled", "skipped"].includes(String(d.financialStatus))) continue;
    const due = text(d, "dueDate"),
      remaining = amount(d, "remainingMinor") ?? 0,
      t = get(text(d, "currency"));
    if (d.section === "monthlyDues") t.owe += remaining;
    if (d.section !== "owedToMe") {
      if (due.startsWith(today.slice(0, 7))) {
        t.dueMonth += amount(d, "amountMinor") ?? 0;
        t.remainingMonth += remaining;
      }
      if (due && due < today) t.overdue += remaining;
      if (due === today) t.dueToday += remaining;
      else if (due > today && due <= addDays(today, 7)) t.dueSoon += remaining;
    }
  }
  for (const { data: d } of payments) {
    if (
      d.direction === "owedToMe" ||
      !text(d, "paymentDate").startsWith(today.slice(0, 7))
    )
      continue;
    const t = get(text(d, "currency"));
    t.paidMonth +=
      (d.entryType === "reversal" ? -1 : 1) * (amount(d, "amountMinor") ?? 0);
  }
  for (const t of Object.values(totals)) t.net = t.owed - t.owe;
  return totals;
}
