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

export type InterestCharge =
  | { kind: "percentage"; rateBasisPoints: number }
  | { kind: "fixedAmount"; amountMinor: number };
export type InterestRatePeriod =
  { kind: "oneTime" } | { kind: "days"; days: number };
export type InterestMethod =
  { kind: "simple" } | { kind: "compound"; intervalDays: number };
export type InterestRounding = "halfUp" | "down" | "up";
export interface CustomInterestOptions {
  charge: InterestCharge;
  ratePeriod: InterestRatePeriod;
  method: InterestMethod;
  rounding: InterestRounding;
  originationDate: string;
  dueDate: string | null;
}
export interface CustomInterest extends CustomInterestOptions {
  calculationVersion: 2;
  principalMinor: number;
  dayCount: number;
  interestMinor: number;
  totalMinor: number;
}

function customObject(input: unknown, fields: readonly string[]) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Choose valid interest terms.");
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).some((key) => !fields.includes(key)) ||
    fields.some((key) => !(key in value))
  )
    throw new Error("Choose valid interest terms.");
  return value;
}

function interestDays(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 36500
  )
    throw new Error("Choose a period from 1 to 36,500 whole days.");
  return value;
}

function commonDivisor(left: bigint, right: bigint): bigint {
  while (right !== 0n) [left, right] = [right, left % right];
  return left;
}

/** Raises a positive growth ratio exactly, stopping as soon as supported debt is impossible. */
function compoundRatio(
  numerator: bigint,
  denominator: bigint,
  periods: number,
  principal: bigint,
): [bigint, bigint] {
  const divisor = commonDivisor(numerator, denominator);
  let baseNumerator = numerator / divisor,
    baseDenominator = denominator / divisor,
    resultNumerator = 1n,
    resultDenominator = 1n;
  const checkBound = (n: bigint, d: bigint) => {
    // The extra minor unit keeps this guard valid for every final rounding mode.
    if (principal * n >= 1000000000001n * d)
      throw new Error("Interest total exceeds the supported amount range.");
  };
  while (periods > 0) {
    if (periods % 2 === 1) {
      resultNumerator *= baseNumerator;
      resultDenominator *= baseDenominator;
      checkBound(resultNumerator, resultDenominator);
    }
    periods = Math.floor(periods / 2);
    if (periods > 0) {
      baseNumerator *= baseNumerator;
      baseDenominator *= baseDenominator;
      checkBound(baseNumerator, baseDenominator);
    }
  }
  return [resultNumerator, resultDenominator];
}

/** Fixes agreed charges for actual elapsed days; compound stubs accrue simply and rounding occurs once. */
export function calculateCustomInterest(
  principalMinor: number,
  options: CustomInterestOptions,
): CustomInterest {
  minor(principalMinor);
  const input = customObject(options, [
    "charge",
    "ratePeriod",
    "method",
    "rounding",
    "originationDate",
    "dueDate",
  ]);
  const rawCharge = customObject(
    input.charge,
    options.charge?.kind === "percentage"
      ? ["kind", "rateBasisPoints"]
      : ["kind", "amountMinor"],
  );
  let charge: InterestCharge;
  if (rawCharge.kind === "percentage") {
    const rateBasisPoints = rawCharge.rateBasisPoints;
    if (
      typeof rateBasisPoints !== "number" ||
      !Number.isSafeInteger(rateBasisPoints) ||
      rateBasisPoints < 0 ||
      rateBasisPoints > 100000
    )
      throw new Error(
        "Enter an interest rate from 0% to 1,000%, with up to two decimal places.",
      );
    charge = { kind: "percentage", rateBasisPoints };
  } else if (rawCharge.kind === "fixedAmount") {
    charge = {
      kind: "fixedAmount",
      amountMinor: minor(rawCharge.amountMinor, true),
    };
  } else throw new Error("Choose a supported interest charge.");
  const rawPeriod = customObject(
    input.ratePeriod,
    options.ratePeriod?.kind === "oneTime" ? ["kind"] : ["kind", "days"],
  );
  let ratePeriod: InterestRatePeriod;
  if (rawPeriod.kind === "oneTime") ratePeriod = { kind: "oneTime" };
  else if (rawPeriod.kind === "days")
    ratePeriod = { kind: "days", days: interestDays(rawPeriod.days) };
  else throw new Error("Choose a supported interest period.");
  const rawMethod = customObject(
    input.method,
    options.method?.kind === "simple" ? ["kind"] : ["kind", "intervalDays"],
  );
  let method: InterestMethod;
  if (rawMethod.kind === "simple") method = { kind: "simple" };
  else if (rawMethod.kind === "compound")
    method = {
      kind: "compound",
      intervalDays: interestDays(rawMethod.intervalDays),
    };
  else throw new Error("Choose a supported interest method.");
  if (
    method.kind === "compound" &&
    (charge.kind !== "percentage" || ratePeriod.kind !== "days")
  )
    throw new Error(
      "Compounding requires a percentage rate over a day-based period.",
    );
  if (
    typeof input.rounding !== "string" ||
    !["halfUp", "down", "up"].includes(input.rounding)
  )
    throw new Error("Choose a supported interest rounding rule.");
  const rounding = input.rounding as InterestRounding;
  if (typeof input.originationDate !== "string")
    throw new Error("Enter a valid borrowed or lent date.");
  const originationDate = civilDate(input.originationDate);
  if (input.dueDate !== null && typeof input.dueDate !== "string")
    throw new Error("Enter a valid due date.");
  const dueDate =
    input.dueDate === null ? null : civilDate(input.dueDate as string);
  if (dueDate !== null && dueDate < originationDate)
    throw new Error("Due date must follow the borrowed or lent date.");
  if (dueDate === null && ratePeriod.kind === "days")
    throw new Error("Choose a due date to calculate interest over time.");
  const dayCount =
    dueDate === null
      ? 0
      : Math.round(
          (Date.parse(dueDate + "T12:00:00Z") -
            Date.parse(originationDate + "T12:00:00Z")) /
            86400000,
        );
  const principal = BigInt(principalMinor);
  let numerator: bigint, denominator: bigint;
  if (
    method.kind === "compound" &&
    charge.kind === "percentage" &&
    ratePeriod.kind === "days"
  ) {
    const rate = BigInt(charge.rateBasisPoints),
      rateDenominator = 10000n * BigInt(ratePeriod.days);
    const [growthNumerator, growthDenominator] = compoundRatio(
      rateDenominator + rate * BigInt(method.intervalDays),
      rateDenominator,
      Math.floor(dayCount / method.intervalDays),
      principal,
    );
    denominator = growthDenominator * rateDenominator;
    numerator =
      principal *
        growthNumerator *
        (rateDenominator + rate * BigInt(dayCount % method.intervalDays)) -
      principal * denominator;
  } else {
    numerator =
      charge.kind === "percentage"
        ? principal * BigInt(charge.rateBasisPoints)
        : BigInt(charge.amountMinor);
    denominator = charge.kind === "percentage" ? 10000n : 1n;
    if (ratePeriod.kind === "days") {
      numerator *= BigInt(dayCount);
      denominator *= BigInt(ratePeriod.days);
    }
  }
  const rounded =
    rounding === "down"
      ? numerator / denominator
      : rounding === "up"
        ? (numerator + denominator - 1n) / denominator
        : (2n * numerator + denominator) / (2n * denominator);
  if (principal + rounded > 1000000000000n)
    throw new Error("Interest total exceeds the supported amount range.");
  const interestMinor = Number(rounded),
    totalMinor = principalMinor + interestMinor;
  return {
    calculationVersion: 2,
    principalMinor,
    charge,
    ratePeriod,
    method,
    rounding,
    originationDate,
    dueDate,
    dayCount,
    interestMinor,
    totalMinor,
  };
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
