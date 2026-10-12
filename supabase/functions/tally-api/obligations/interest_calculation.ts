import { exactObject } from "../shared/callable.ts";
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
export interface LegacyInterest {
  rateBasisPoints: number;
  basis: string;
  agreementNotes: string;
}
export type InterestInfo =
  | LegacyInterest
  | (SimpleInterest & { agreementNotes: string });

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
