import type { RecordData } from "../shared/runtime.ts";
import {
  civilDate,
  currencies,
  type Currency,
  identifier,
  localToday,
} from "../shared/validation.ts";
import {
  checkedSum,
  foldFinancialLedger,
  invalidLedger,
  type LedgerInput,
} from "../payments/ledger.ts";

export interface ProjectionContext {
  uid: string;
  timezone: string;
  yearMonth: string;
  today: string;
  now: Date;
}
export interface MonthTotals {
  scheduledMinor: number;
  remainingMinor: number;
  paidMinor: number;
  assumedPaidMinor: number;
  confirmedPaidMinor: number;
  unknownAmountCount: number;
}
export interface AttentionTotals {
  amountMinor: number;
  count: number;
  unknownAmountCount: number;
}
export interface DirectionTotals<T> {
  outgoing: T;
  incoming: T;
}
export interface Position {
  youOweMinor: number;
  owedToYouMinor: number;
  netPositionMinor: number;
}
export interface CurrencyProjection extends Position {
  currency: Currency;
  recurringOutstandingMinor: number;
  unknownAmountCount: number;
  month: DirectionTotals<MonthTotals>;
  attention: {
    dueToday: DirectionTotals<AttentionTotals>;
    dueSoon: DirectionTotals<AttentionTotals>;
    overdue: DirectionTotals<AttentionTotals>;
  };
}
export interface ContactProjection {
  contactId: string;
  currencies: Record<
    Currency,
    Position & {
      activeCount: number;
      completedCount: number;
      cancelledCount: number;
    }
  >;
}
export interface Projection {
  currencies: Record<Currency, CurrencyProjection>;
  contacts: Record<string, ContactProjection>;
}
const month = (): MonthTotals => ({
  scheduledMinor: 0,
  remainingMinor: 0,
  paidMinor: 0,
  assumedPaidMinor: 0,
  confirmedPaidMinor: 0,
  unknownAmountCount: 0,
});
const attention = (): AttentionTotals => ({
  amountMinor: 0,
  count: 0,
  unknownAmountCount: 0,
});
const directions = <T>(factory: () => T): DirectionTotals<T> => ({
  outgoing: factory(),
  incoming: factory(),
});
const position = (): Position => ({
  youOweMinor: 0,
  owedToYouMinor: 0,
  netPositionMinor: 0,
});
export function emptyCurrency(currency: Currency): CurrencyProjection {
  return {
    currency,
    ...position(),
    recurringOutstandingMinor: 0,
    unknownAmountCount: 0,
    month: directions(month),
    attention: {
      dueToday: directions(attention),
      dueSoon: directions(attention),
      overdue: directions(attention),
    },
  };
}
export function calculateProjection(
  input: LedgerInput & { contacts: RecordData[] },
  context: ProjectionContext,
): Projection {
  const ledger = foldFinancialLedger(input, context.uid);
  const financialDay = localToday(context.timezone, context.now);
  if (
    context.today !== financialDay ||
    context.yearMonth !== financialDay.slice(0, 7)
  ) return invalidLedger();
  const buckets = Object.fromEntries(
    currencies.map((currency) => [currency, emptyCurrency(currency)]),
  ) as Record<Currency, CurrencyProjection>;
  const contacts: Record<string, ContactProjection> = Object.create(
    null,
  ) as Record<string, ContactProjection>;
  for (const contact of input.contacts) {
    const id = identifier(contact.contactId);
    if (
      contact.userId !== context.uid || contact.schemaVersion !== 1 ||
      contacts[id]
    ) return invalidLedger();
    contacts[id] = {
      contactId: id,
      currencies: Object.fromEntries(
        currencies.map(
          (currency) => [currency, {
            ...position(),
            activeCount: 0,
            completedCount: 0,
            cancelledCount: 0,
          }],
        ),
      ) as ContactProjection["currencies"],
    };
  }
  for (const parent of ledger.parents.values()) {
    if (["recurringDue", "subscription"].includes(parent.type)) continue;
    const currency = parent.currency as Currency;
    const bucket = buckets[currency];
    const side = parent.direction === "owedByMe"
      ? "youOweMinor"
      : "owedToYouMinor";
    const remaining =
      ledger.parentBalances.get(parent.obligationId)!.remainingMinor;
    if (parent.lifecycle !== "cancelled") {
      bucket[side] = checkedSum([bucket[side], remaining]);
    }
    if (parent.contactId !== null) {
      const contact = contacts[identifier(parent.contactId)];
      if (!contact) return invalidLedger();
      const contactBucket = contact.currencies[currency];
      if (parent.lifecycle === "cancelled") contactBucket.cancelledCount++;
      else {
        contactBucket[side] = checkedSum([contactBucket[side], remaining]);
        if (remaining === 0) contactBucket.completedCount++;
        else contactBucket.activeCount++;
      }
    }
  }
  const localDays = new Map<string, string>();
  for (const instance of ledger.instances.values()) {
    const parent = ledger.parents.get(instance.obligationId)!;
    if (
      parent.lifecycle === "cancelled" ||
      ["cancelled", "skipped"].includes(instance.financialStatus)
    ) continue;
    const bucket = buckets[parent.currency as Currency];
    const side = parent.direction === "owedByMe" ? "outgoing" : "incoming";
    const balance = ledger.balances.get(instance.instanceId)!;
    const unknown = balance.amountMinor === null;
    if (unknown) bucket.unknownAmountCount++;
    const due = instance.dueDate as string | null;
    if (due !== null && due.slice(0, 7) === context.yearMonth) {
      const totals = bucket.month[side];
      if (unknown) totals.unknownAmountCount++;
      else {
        totals.scheduledMinor = checkedSum([
          totals.scheduledMinor,
          balance.amountMinor!,
        ]);
        totals.remainingMinor = checkedSum([
          totals.remainingMinor,
          balance.remainingMinor!,
        ]);
      }
    }
    if (due === null || instance.closed || balance.remainingMinor === 0) {
      continue;
    }
    let today = localDays.get(instance.timezone);
    if (!today) {
      try {
        today = localToday(instance.timezone, context.now);
      } catch {
        return invalidLedger();
      }
      localDays.set(instance.timezone, today);
    }
    // Due dates are civil strings. UTC is used only to add calendar days here.
    const date = new Date(`${civilDate(today)}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 7);
    const soonThrough = date.toISOString().slice(0, 10);
    const group = due < today
      ? "overdue"
      : due === today
      ? "dueToday"
      : due <= soonThrough
      ? "dueSoon"
      : null;
    if (group) {
      const totals = bucket.attention[group][side];
      totals.count++;
      if (unknown) totals.unknownAmountCount++;
      else {totals.amountMinor = checkedSum([
          totals.amountMinor,
          balance.remainingMinor!,
        ]);}
    }
    if (
      ["recurringDue", "subscription"].includes(parent.type) &&
      side === "outgoing" && due <= today && !unknown
    ) {
      bucket.recurringOutstandingMinor = checkedSum([
        bucket.recurringOutstandingMinor,
        balance.remainingMinor!,
      ]);
    }
  }
  for (const payment of ledger.effectivePayments) {
    if (payment.paymentDate.slice(0, 7) !== context.yearMonth) continue;
    const totals = buckets[payment.currency as Currency]
      .month[payment.direction === "owedByMe" ? "outgoing" : "incoming"];
    totals.paidMinor = checkedSum([totals.paidMinor, payment.amountMinor]);
    const field = payment.provenance === "assumedAutomatic" &&
        !ledger.evidencedPaymentIds.has(payment.paymentId)
      ? "assumedPaidMinor"
      : "confirmedPaidMinor";
    totals[field] = checkedSum([totals[field], payment.amountMinor]);
  }
  for (const bucket of Object.values(buckets)) {
    bucket.netPositionMinor = checkedSum([
      bucket.owedToYouMinor,
      -bucket.youOweMinor,
    ]);
  }
  for (const contact of Object.values(contacts)) {
    for (const bucket of Object.values(contact.currencies)) {
      bucket.netPositionMinor = checkedSum([
        bucket.owedToYouMinor,
        -bucket.youOweMinor,
      ]);
    }
  }
  return { currencies: buckets, contacts };
}
