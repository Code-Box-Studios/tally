import { civilDate } from "../../core/domain/date";
import { currency, minor } from "../../core/domain/money";
import { object, text, type Row } from "../../core/domain/records";

export interface PayoffOptions {
  today: string;
  extraMonthlyMinor: number;
  firstExtraDate: string;
  monthlyPaymentMinor?: number;
  firstPaymentDate?: string;
}

export interface ProjectedPayment {
  date: string;
  scheduledMinor: number;
  extraMinor: number;
  remainingMinor: number;
}

export interface PayoffTimeline {
  payoffDate: string;
  totalPaidMinor: number;
  payments: ProjectedPayment[];
}

export type PayoffProjection =
  | {
      status: "unavailable" | "paid" | "needsMonthlyPayment";
      message: string;
    }
  | {
      status: "ready";
      remainingMinor: number;
      baseline: PayoffTimeline;
      accelerated: PayoffTimeline;
      daysEarlier: number;
      interestKind: "fixed" | "none" | "informational";
      interestSavingsMinor: 0 | null;
      usesHypotheticalPayments: boolean;
      overdueMinor: number;
    };

interface ScheduledPayment {
  date: string;
  amountMinor: number;
}

function monthDate(anchor: string, offset: number): string {
  const [year, month, day] = anchor.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1, 12));
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return civilDate(date.toISOString().slice(0, 10));
}

function monthDifference(first: string, last: string): number {
  return (
    (Number(last.slice(0, 4)) - Number(first.slice(0, 4))) * 12 +
    Number(last.slice(5, 7)) -
    Number(first.slice(5, 7))
  );
}

function installmentSchedule(
  obligation: Row,
  instances: Row[],
): ScheduledPayment[] {
  const invalid = (): never => {
    throw new Error(
      "Refresh the complete installment schedule before estimating payoff.",
    );
  };
  const ids = obligation.data.installmentInstanceIds;
  const owned = instances.filter(
    (row) => row.data.obligationId === obligation.id,
  );
  if (
    !Array.isArray(ids) ||
    ids.length < 2 ||
    ids.length > 120 ||
    new Set(ids).size !== ids.length ||
    owned.length !== ids.length ||
    new Set(owned.map((row) => row.id)).size !== owned.length ||
    owned.some((row) => !ids.includes(row.id))
  )
    return invalid();

  let original = 0,
    paid = 0,
    remaining = 0;
  const schedule = owned.map((row) => {
    if (
      row.data.currency !== obligation.data.currency ||
      ["cancelled", "skipped"].includes(text(row.data, "financialStatus"))
    )
      return invalid();
    let originalMinor: number,
      paidMinor: number,
      remainingMinor: number,
      date: string;
    try {
      originalMinor = minor(row.data.amountMinor);
      paidMinor = minor(row.data.totalPaidMinor, true);
      remainingMinor = minor(row.data.remainingMinor, true);
      date = civilDate(text(row.data, "dueDate"));
    } catch {
      return invalid();
    }
    if (
      paidMinor + remainingMinor !== originalMinor ||
      row.data.closed !== (remainingMinor === 0)
    )
      return invalid();
    original += originalMinor;
    paid += paidMinor;
    remaining += remainingMinor;
    return { date, amountMinor: remainingMinor };
  });
  if (
    original !== obligation.data.originalAmountMinor ||
    paid !== obligation.data.totalPaidMinor ||
    remaining !== obligation.data.remainingMinor
  )
    return invalid();
  return schedule.filter((payment) => payment.amountMinor > 0);
}

function timeline(
  scheduled: ScheduledPayment[],
  remainingMinor: number,
  extraMonthlyMinor: number,
  firstExtraDate: string,
): PayoffTimeline {
  const events = new Map<
    string,
    { scheduledMinor: number; extraMinor: number }
  >();
  for (const payment of scheduled) {
    const event = events.get(payment.date) ?? {
      scheduledMinor: 0,
      extraMinor: 0,
    };
    event.scheduledMinor += payment.amountMinor;
    events.set(payment.date, event);
  }
  const lastDate = scheduled[scheduled.length - 1].date;
  if (extraMonthlyMinor > 0 && firstExtraDate <= lastDate) {
    const months = monthDifference(firstExtraDate, lastDate);
    for (let offset = 0; offset <= months; offset++) {
      const date = monthDate(firstExtraDate, offset);
      if (date > lastDate) break;
      const event = events.get(date) ?? { scheduledMinor: 0, extraMinor: 0 };
      event.extraMinor = extraMonthlyMinor;
      events.set(date, event);
    }
  }
  let remaining = remainingMinor;
  const payments: ProjectedPayment[] = [];
  for (const [date, event] of [...events].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const scheduledMinor = Math.min(remaining, event.scheduledMinor);
    remaining -= scheduledMinor;
    const extraMinor = Math.min(remaining, event.extraMinor);
    remaining -= extraMinor;
    payments.push({
      date,
      scheduledMinor,
      extraMinor,
      remainingMinor: remaining,
    });
    if (remaining === 0) break;
  }
  return {
    payoffDate: payments[payments.length - 1].date,
    totalPaidMinor: remainingMinor - remaining,
    payments,
  };
}

/** Projects the recorded balance without recalculating interest or changing saved records. */
export function projectPayoff(
  obligation: Row,
  instances: Row[],
  options: PayoffOptions,
): PayoffProjection {
  const data = obligation.data;
  if (data.section === "monthlyDues") {
    return {
      status: "unavailable",
      message:
        "Payoff estimates apply to loans and installments. Recurring bills have no fixed payoff balance.",
    };
  }
  if (
    !["loan", "owedByMe", "owedToMe", "installment"].includes(
      text(data, "type"),
    )
  ) {
    return {
      status: "unavailable",
      message:
        "This obligation type does not have a supported payoff schedule.",
    };
  }
  if (data.lifecycle === "cancelled" || data.archived === true) {
    return {
      status: "unavailable",
      message:
        "Payoff estimates are unavailable for cancelled or archived obligations.",
    };
  }
  currency(data.currency);
  const remainingMinor = minor(data.remainingMinor, true);
  const originalMinor = minor(data.originalAmountMinor);
  const paidMinor = minor(data.totalPaidMinor, true);
  if (paidMinor + remainingMinor !== originalMinor) {
    throw new Error(
      "Refresh this obligation’s balances before estimating payoff.",
    );
  }
  if (remainingMinor === 0) {
    return {
      status: "paid",
      message:
        "This obligation is already paid. No future payments are needed.",
    };
  }
  const today = civilDate(options.today);
  const firstExtraDate = civilDate(options.firstExtraDate);
  const extraMonthlyMinor = minor(options.extraMonthlyMinor, true);
  const originationDate = text(data, "originationDate");
  if (originationDate) civilDate(originationDate);
  const firstAllowedDate = originationDate > today ? originationDate : today;
  if (firstExtraDate < firstAllowedDate) {
    throw new Error(
      "Choose an extra payment date on or after today and the loan start date.",
    );
  }

  let scheduled: ScheduledPayment[];
  let usesHypotheticalPayments = false;
  if (data.type === "installment") {
    scheduled = installmentSchedule(obligation, instances);
  } else {
    const single = instances.find(
      (row) =>
        row.id === data.singleInstanceId &&
        row.data.obligationId === obligation.id,
    );
    const due =
      text(data, "dueDate") ||
      text(single?.data ?? {}, "dueDate") ||
      text(data, "nextDueDate");
    if (due) {
      scheduled = [{ date: civilDate(due), amountMinor: remainingMinor }];
    } else {
      if (options.monthlyPaymentMinor == null) {
        return {
          status: "needsMonthlyPayment",
          message:
            "No due date is saved. Enter a monthly payment to compare a hypothetical repayment plan.",
        };
      }
      const monthlyMinor = minor(options.monthlyPaymentMinor);
      const firstPaymentDate = civilDate(
        options.firstPaymentDate ?? firstExtraDate,
      );
      if (firstPaymentDate < firstAllowedDate) {
        throw new Error(
          "Choose a monthly payment date on or after today and the loan start date.",
        );
      }
      const count = Math.ceil(remainingMinor / monthlyMinor);
      if (count > monthDifference(firstPaymentDate, "2199-12-31") + 1) {
        throw new Error(
          "Choose a monthly payment that pays off the balance by 2199.",
        );
      }
      scheduled = Array.from({ length: count }, (_, offset) => ({
        date: monthDate(firstPaymentDate, offset),
        amountMinor: Math.min(
          monthlyMinor,
          remainingMinor - monthlyMinor * offset,
        ),
      }));
      usesHypotheticalPayments = true;
    }
  }
  const overdueMinor = scheduled.reduce(
    (sum, payment) => sum + (payment.date < today ? payment.amountMinor : 0),
    0,
  );
  scheduled = scheduled
    .map((payment) => ({
      ...payment,
      date: payment.date < today ? today : payment.date,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const baseline = timeline(scheduled, remainingMinor, 0, firstExtraDate);
  const accelerated = timeline(
    scheduled,
    remainingMinor,
    extraMonthlyMinor,
    firstExtraDate,
  );
  const interest = data.interestInfo ? object(data.interestInfo) : null;
  const interestKind = !interest
    ? "none"
    : interest.calculationVersion === 1 || interest.calculationVersion === 2
      ? "fixed"
      : "informational";
  return {
    status: "ready",
    remainingMinor,
    baseline,
    accelerated,
    daysEarlier: Math.round(
      (Date.parse(baseline.payoffDate + "T12:00:00Z") -
        Date.parse(accelerated.payoffDate + "T12:00:00Z")) /
        86400000,
    ),
    interestKind,
    interestSavingsMinor: interestKind === "informational" ? null : 0,
    usesHypotheticalPayments,
    overdueMinor,
  };
}
