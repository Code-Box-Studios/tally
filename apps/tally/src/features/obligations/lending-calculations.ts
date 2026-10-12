import { addDays, civilDate } from "../../core/domain/date";
import { minor } from "../../core/domain/money";

export type InterestBasis = "oneTime" | "monthly" | "annual";
export type InstallmentFrequency = "weekly" | "biweekly" | "monthly";
export interface SimpleInterest {
  calculationVersion: 1;
  principalMinor: number;
  rateBasisPoints: number;
  basis: InterestBasis;
  originationDate: string;
  dueDate: string | null;
  dayCount: number;
  interestMinor: number;
  totalMinor: number;
}

/** Fixes simple interest for the agreed dates, using actual/30 or actual/365 and half-up rounding once. */
export function calculateInterest(
  principalMinor: number,
  rateBasisPoints: number,
  basis: InterestBasis,
  originationDate: string,
  dueDate: string | null,
): SimpleInterest {
  minor(principalMinor);
  if (
    !Number.isSafeInteger(rateBasisPoints) ||
    rateBasisPoints < 0 ||
    rateBasisPoints > 100000
  )
    throw new Error(
      "Enter an interest rate from 0% to 1,000%, with up to two decimal places.",
    );
  if (!["oneTime", "monthly", "annual"].includes(basis))
    throw new Error("Choose a supported interest basis.");
  civilDate(originationDate);
  if (dueDate !== null) {
    civilDate(dueDate);
    if (dueDate < originationDate)
      throw new Error("Due date must follow the borrowed or lent date.");
  } else if (basis !== "oneTime")
    throw new Error(
      "Choose a due date to calculate monthly or annual interest.",
    );
  const dayCount =
    dueDate === null
      ? 0
      : Math.round(
          (Date.parse(dueDate + "T12:00:00Z") -
            Date.parse(originationDate + "T12:00:00Z")) /
            86400000,
        );
  const numerator =
    BigInt(principalMinor) *
    BigInt(rateBasisPoints) *
    BigInt(basis === "oneTime" ? 1 : dayCount);
  const denominator =
    10000n * BigInt(basis === "monthly" ? 30 : basis === "annual" ? 365 : 1);
  const interestMinor = minor(
    Number((numerator + denominator / 2n) / denominator),
    true,
  );
  const totalMinor = minor(principalMinor + interestMinor);
  return {
    calculationVersion: 1,
    principalMinor,
    rateBasisPoints,
    basis,
    originationDate,
    dueDate,
    dayCount,
    interestMinor,
    totalMinor,
  };
}

export function parseInterestRate(value: string): number {
  const rate = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(rate))
    throw new Error("Enter an interest rate with up to two decimal places.");
  const [whole, fraction = ""] = rate.split(".");
  const result = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
  if (!Number.isSafeInteger(result) || result > 100000)
    throw new Error("Interest rate cannot exceed 1,000%.");
  return result;
}

function countInstallments(count: number) {
  if (!Number.isInteger(count) || count < 2 || count > 120)
    throw new Error("Choose between 2 and 120 installments.");
}

export function installmentDates(
  count: number,
  firstDueDate: string,
  frequency: InstallmentFrequency,
): string[] {
  countInstallments(count);
  civilDate(firstDueDate);
  if (!["weekly", "biweekly", "monthly"].includes(frequency))
    throw new Error("Choose a supported installment frequency.");
  const [year, month, day] = firstDueDate.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    if (frequency !== "monthly")
      return addDays(firstDueDate, index * (frequency === "weekly" ? 7 : 14));
    const date = new Date(Date.UTC(year, month - 1 + index, 1, 12));
    const lastDay = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12),
    ).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    return civilDate(date.toISOString().slice(0, 10));
  });
}

export function generateInstallments(
  totalMinor: number,
  count: number,
  firstDueDate: string,
  frequency: InstallmentFrequency,
): { amountMinor: number; dueDate: string }[] {
  const dates = installmentDates(count, firstDueDate, frequency);
  const amounts = splitInstallmentAmounts(totalMinor, count);
  return dates.map((dueDate, index) => ({
    dueDate,
    amountMinor: amounts[index],
  }));
}

export function splitInstallmentAmounts(
  totalMinor: number,
  count: number,
): number[] {
  minor(totalMinor);
  countInstallments(count);
  const base = Math.floor(totalMinor / count);
  if (base === 0)
    throw new Error("The amount is too small for that many installments.");
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? totalMinor - base * (count - 1) : base,
  );
}
