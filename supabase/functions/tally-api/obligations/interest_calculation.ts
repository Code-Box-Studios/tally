import { exactObject } from "../shared/callable.ts";
import { HttpsError } from "../shared/errors.ts";
import {
  civilDate,
  enumValue,
  invalid,
  moneyMinor,
  nullableDate,
  textValue,
} from "../shared/validation.ts";

export interface SimpleInterest {
  calculationVersion: 1;
  principalMinor: number;
  rateBasisPoints: number;
  basis: "oneTime" | "monthly" | "annual";
  originationDate: string;
  dueDate: string | null;
  dayCount: number;
  interestMinor: number;
  totalMinor: number;
}
function nonnegativeAmount(value: unknown): number {
  return value === 0 ? 0 : moneyMinor(value);
}

export type InterestCharge =
  | { kind: "percentage"; rateBasisPoints: number }
  | { kind: "fixedAmount"; amountMinor: number };
export type InterestRatePeriod =
  | { kind: "oneTime" }
  | { kind: "days"; days: number };
export type InterestMethod =
  | { kind: "simple" }
  | { kind: "compound"; intervalDays: number };
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

function interestDays(value: unknown): number {
  if (
    typeof value !== "number" || !Number.isSafeInteger(value) ||
    value < 1 || value > 36500
  ) return invalid("Choose a period from 1 to 36,500 whole days.");
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
    if (principal * n >= 1000000000001n * d) {
      return invalid("Interest total exceeds the supported amount range.");
    }
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
  principalInput: unknown,
  optionsInput: unknown,
): CustomInterest {
  const principalMinor = moneyMinor(principalInput),
    options = optionsInput as CustomInterestOptions;
  const input = exactObject(options, [
    "charge",
    "ratePeriod",
    "method",
    "rounding",
    "originationDate",
    "dueDate",
  ]);
  const rawCharge = exactObject(
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
      !Number.isSafeInteger(rateBasisPoints) || rateBasisPoints < 0 ||
      rateBasisPoints > 100000
    ) {
      return invalid(
        "Enter an interest rate from 0% to 1,000%, with up to two decimal places.",
      );
    }
    charge = { kind: "percentage", rateBasisPoints };
  } else if (rawCharge.kind === "fixedAmount") {
    charge = {
      kind: "fixedAmount",
      amountMinor: nonnegativeAmount(rawCharge.amountMinor),
    };
  } else return invalid("Choose a supported interest charge.");
  const rawPeriod = exactObject(
    input.ratePeriod,
    options.ratePeriod?.kind === "oneTime" ? ["kind"] : ["kind", "days"],
  );
  let ratePeriod: InterestRatePeriod;
  if (rawPeriod.kind === "oneTime") ratePeriod = { kind: "oneTime" };
  else if (rawPeriod.kind === "days") {
    ratePeriod = { kind: "days", days: interestDays(rawPeriod.days) };
  } else return invalid("Choose a supported interest period.");
  const rawMethod = exactObject(
    input.method,
    options.method?.kind === "simple" ? ["kind"] : ["kind", "intervalDays"],
  );
  let method: InterestMethod;
  if (rawMethod.kind === "simple") method = { kind: "simple" };
  else if (rawMethod.kind === "compound") {
    method = {
      kind: "compound",
      intervalDays: interestDays(rawMethod.intervalDays),
    };
  } else return invalid("Choose a supported interest method.");
  if (
    method.kind === "compound" &&
    (charge.kind !== "percentage" || ratePeriod.kind !== "days")
  ) {
    return invalid(
      "Compounding requires a percentage rate over a day-based period.",
    );
  }
  if (
    typeof input.rounding !== "string" ||
    !["halfUp", "down", "up"].includes(input.rounding)
  ) {
    return invalid("Choose a supported interest rounding rule.");
  }
  const rounding = input.rounding as InterestRounding;
  if (typeof input.originationDate !== "string") {
    return invalid("Enter a valid borrowed or lent date.");
  }
  const originationDate = civilDate(input.originationDate);
  if (input.dueDate !== null && typeof input.dueDate !== "string") {
    return invalid("Enter a valid due date.");
  }
  const dueDate = input.dueDate === null
    ? null
    : civilDate(input.dueDate as string);
  if (dueDate !== null && dueDate < originationDate) {
    return invalid("Due date must follow the borrowed or lent date.");
  }
  if (dueDate === null && ratePeriod.kind === "days") {
    return invalid("Choose a due date to calculate interest over time.");
  }
  const dayCount = dueDate === null ? 0 : Math.round(
    (Date.parse(dueDate + "T12:00:00Z") -
      Date.parse(originationDate + "T12:00:00Z")) / 86400000,
  );
  const principal = BigInt(principalMinor);
  let numerator: bigint, denominator: bigint;
  if (
    method.kind === "compound" && charge.kind === "percentage" &&
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
    numerator = principal * growthNumerator *
        (rateDenominator + rate * BigInt(dayCount % method.intervalDays)) -
      principal * denominator;
  } else {
    numerator = charge.kind === "percentage"
      ? principal * BigInt(charge.rateBasisPoints)
      : BigInt(charge.amountMinor);
    denominator = charge.kind === "percentage" ? 10000n : 1n;
    if (ratePeriod.kind === "days") {
      numerator *= BigInt(dayCount);
      denominator *= BigInt(ratePeriod.days);
    }
  }
  const rounded = rounding === "down"
    ? numerator / denominator
    : rounding === "up"
    ? (numerator + denominator - 1n) / denominator
    : (2n * numerator + denominator) / (2n * denominator);
  if (principal + rounded > 1000000000000n) {
    return invalid("Interest total exceeds the supported amount range.");
  }
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

export interface LegacyInterest {
  rateBasisPoints: number;
  basis: string;
  agreementNotes: string;
}
export type InterestInfo =
  | LegacyInterest
  | ((SimpleInterest | CustomInterest) & { agreementNotes: string });

function rate(value: unknown): number {
  if (
    typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 ||
    value > 100000
  ) return invalid("Enter an interest rate from 0% to 1,000%.");
  return value;
}

/** An upfront fixed simple charge: monthly actual/30, annual actual/365, no compounding. */
export function calculateSimpleInterest(
  principal: unknown,
  rateInput: unknown,
  basisInput: unknown,
  startInput: unknown,
  dueInput: unknown,
): SimpleInterest {
  const principalMinor = moneyMinor(principal),
    rateBasisPoints = rate(rateInput);
  const basis = enumValue(
    basisInput,
    ["oneTime", "monthly", "annual"] as const,
  );
  const originationDate = civilDate(startInput),
    dueDate = nullableDate(dueInput);
  if (dueDate !== null && dueDate < originationDate) {
    return invalid("Due date must follow the borrowed or lent date.");
  }
  if (dueDate === null && basis !== "oneTime") {
    return invalid(
      "Choose a due date to calculate monthly or annual interest.",
    );
  }
  const dayCount = dueDate === null ? 0 : Math.round(
    (Date.parse(dueDate + "T12:00:00Z") -
      Date.parse(originationDate + "T12:00:00Z")) / 86400000,
  );
  const numerator = BigInt(principalMinor) * BigInt(rateBasisPoints) *
    BigInt(basis === "oneTime" ? 1 : dayCount);
  const denominator = 10000n *
    BigInt(basis === "monthly" ? 30 : basis === "annual" ? 365 : 1);
  const interestMinor = Number((numerator + denominator / 2n) / denominator);
  const totalMinor = moneyMinor(principalMinor + interestMinor);
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

/** Preserves legacy informational terms and validates every derived field for new charges. */
export function validateInterestInfo(
  input: unknown,
  amountMinor: number,
  originationDate: string,
  dueDate: string | null,
): InterestInfo | null {
  if (input === null) return null;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return invalid("Invalid interest terms.");
  }
  if (!("calculationVersion" in input)) {
    const legacy = exactObject(input, [
      "rateBasisPoints",
      "basis",
      "agreementNotes",
    ]);
    return {
      rateBasisPoints: rate(legacy.rateBasisPoints),
      basis: textValue(legacy.basis, 80, true),
      agreementNotes: textValue(legacy.agreementNotes, 2000),
    };
  }
  if (input.calculationVersion === 2) {
    const info = exactObject(input, [
      "calculationVersion",
      "principalMinor",
      "charge",
      "ratePeriod",
      "method",
      "rounding",
      "originationDate",
      "dueDate",
      "dayCount",
      "interestMinor",
      "totalMinor",
      "agreementNotes",
    ]);
    if (info.originationDate !== originationDate || info.dueDate !== dueDate) {
      return invalid("Interest dates must match the obligation.");
    }
    const calculated = calculateCustomInterest(info.principalMinor, {
      charge: info.charge,
      ratePeriod: info.ratePeriod,
      method: info.method,
      rounding: info.rounding,
      originationDate,
      dueDate,
    });
    if (
      info.dayCount !== calculated.dayCount ||
      info.interestMinor !== calculated.interestMinor ||
      info.totalMinor !== calculated.totalMinor ||
      amountMinor !== calculated.totalMinor
    ) {
      return invalid(
        "Interest and total due must match the verified calculation.",
      );
    }
    return {
      ...calculated,
      agreementNotes: textValue(info.agreementNotes, 2000),
    };
  }
  if (input.calculationVersion !== 1) {
    return invalid("Choose a supported interest calculation version.");
  }
  const info = exactObject(input, [
    "calculationVersion",
    "principalMinor",
    "rateBasisPoints",
    "basis",
    "originationDate",
    "dueDate",
    "dayCount",
    "interestMinor",
    "totalMinor",
    "agreementNotes",
  ]);
  if (
    info.calculationVersion !== 1 || info.originationDate !== originationDate ||
    info.dueDate !== dueDate
  ) return invalid("Interest dates must match the obligation.");
  const calculated = calculateSimpleInterest(
    info.principalMinor,
    info.rateBasisPoints,
    info.basis,
    originationDate,
    dueDate,
  );
  if (
    info.dayCount !== calculated.dayCount ||
    info.interestMinor !== calculated.interestMinor ||
    info.totalMinor !== calculated.totalMinor ||
    amountMinor !== calculated.totalMinor
  ) {
    return invalid(
      "Interest and total due must match the verified calculation.",
    );
  }
  return {
    ...calculated,
    agreementNotes: textValue(info.agreementNotes, 2000),
  };
}

function orderedTerms(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(orderedTerms);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(
        ([key, item]) => [key, orderedTerms(item)],
      ),
    );
  }
  return value;
}

/** Recorded payments retain their agreed interest breakdown; explanatory notes may change. */
export function assertInterestTermsUnchanged(
  existing: unknown,
  proposed: InterestInfo | null,
): void {
  const termsOnly = (value: unknown) => {
    if (value === null || value === undefined) return null;
    if (typeof value !== "object" || Array.isArray(value)) return value;
    const { agreementNotes: _notes, ...terms } = value as Record<
      string,
      unknown
    >;
    return orderedTerms(terms);
  };
  if (
    JSON.stringify(termsOnly(existing)) !== JSON.stringify(termsOnly(proposed))
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Paid history keeps its original interest terms. You can update agreement notes.",
    );
  }
}
