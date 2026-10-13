import { civilDate, addDays } from "../../core/domain/date";
import {
  currency,
  formatMoney,
  moneyInput,
  parseMoney,
} from "../../core/domain/money";
import { object, text, type Data } from "../../core/domain/records";
import {
  parseInterestRate,
  type CustomInterestOptions,
  type InterestRounding,
} from "./lending-calculations";

export type InterestSettings = {
  chargeKind: "percentage" | "fixedAmount";
  rate: string;
  fixedAmount: string;
  period: string;
  periodDays: string;
  method: "simple" | "compound";
  compoundDays: string;
  rounding: InterestRounding;
  agreementNotes: string;
};
const standardDays = [1, 7, 30, 360, 365];
export function readInterestSettings(
  saved: Data | null,
  code: string,
): InterestSettings {
  const charge = saved?.calculationVersion === 2 ? object(saved.charge) : {};
  const period =
    saved?.calculationVersion === 2 ? object(saved.ratePeriod) : {};
  const method = saved?.calculationVersion === 2 ? object(saved.method) : {};
  const days =
    saved?.calculationVersion === 1
      ? saved.basis === "monthly"
        ? 30
        : saved.basis === "annual"
          ? 365
          : null
      : period.kind === "days"
        ? Number(period.days)
        : null;
  return {
    chargeKind: charge.kind === "fixedAmount" ? "fixedAmount" : "percentage",
    rate: saved
      ? String(
          Number(charge.rateBasisPoints ?? saved.rateBasisPoints ?? 0) / 100,
        )
      : "",
    fixedAmount:
      charge.kind === "fixedAmount"
        ? moneyInput(Number(charge.amountMinor), code)
        : "",
    period:
      days === null
        ? "oneTime"
        : standardDays.includes(days)
          ? String(days)
          : "custom",
    periodDays: String(days ?? 30),
    method: method.kind === "compound" ? "compound" : "simple",
    compoundDays: String(method.intervalDays ?? days ?? 30),
    rounding: (saved?.rounding ?? "halfUp") as InterestRounding,
    agreementNotes: text(saved ?? {}, "agreementNotes"),
  };
}
function wholeDays(value: string): number {
  if (!/^\d+$/.test(value.trim()))
    throw new Error("Enter a whole number of days.");
  const days = Number(value);
  if (!Number.isSafeInteger(days) || days < 1 || days > 36500)
    throw new Error("Choose a period from 1 to 36,500 whole days.");
  return days;
}
export function customInterestOptions(
  settings: InterestSettings,
  date: string,
  due: string | null,
  code: string,
): CustomInterestOptions {
  const zero = currency(code) === "JPY" ? /^0+$/ : /^0+(?:\.0{1,2})?$/;
  return {
    charge:
      settings.chargeKind === "percentage"
        ? {
            kind: "percentage",
            rateBasisPoints: parseInterestRate(settings.rate),
          }
        : {
            kind: "fixedAmount",
            amountMinor: zero.test(settings.fixedAmount.trim())
              ? 0
              : parseMoney(settings.fixedAmount, code),
          },
    ratePeriod:
      settings.period === "oneTime"
        ? { kind: "oneTime" }
        : {
            kind: "days",
            days: wholeDays(
              settings.period === "custom"
                ? settings.periodDays
                : settings.period,
            ),
          },
    method:
      settings.method === "compound"
        ? { kind: "compound", intervalDays: wholeDays(settings.compoundDays) }
        : { kind: "simple" },
    rounding: settings.rounding,
    originationDate: date,
    dueDate: due,
  };
}
export function hasComputedInterest(saved: Data | null): boolean {
  return saved?.calculationVersion === 1 || saved?.calculationVersion === 2;
}
export function interestSummary(info: Data, code: string): string {
  if (info.calculationVersion === 2) {
    const charge = object(info.charge),
      period = object(info.ratePeriod),
      method = object(info.method);
    const rate =
      charge.kind === "fixedAmount"
        ? formatMoney(Number(charge.amountMinor), code)
        : String(Number(charge.rateBasisPoints) / 100) + "%";
    const timing =
      period.kind === "oneTime"
        ? "one-time charge"
        : "every " + String(period.days) + " days";
    const calculation =
      method.kind === "compound"
        ? "compound every " + String(method.intervalDays) + " days"
        : "simple interest";
    const rounding =
      info.rounding === "down"
        ? "rounded down"
        : info.rounding === "up"
          ? "rounded up"
          : "rounded to nearest";
    return (
      rate +
      " · " +
      timing +
      " · " +
      calculation +
      " · " +
      rounding +
      ". Fixed for the agreed term."
    );
  }
  const basis =
    info.basis === "oneTime"
      ? "one-time charge"
      : info.basis === "monthly"
        ? "every 30 days"
        : "365-day year";
  return (
    String(Number(info.rateBasisPoints) / 100) +
    "% · " +
    basis +
    (info.calculationVersion === 1
      ? " · Fixed simple interest"
      : " · Informational terms; recorded balance unchanged.")
  );
}
export function loanTermDueDate(
  start: string,
  value: string,
  unit: string,
): string {
  const date = civilDate(start);
  if (!/^\d+$/.test(value.trim()) || Number(value) < 1 || Number(value) > 36500)
    throw new Error("Enter a loan length from 1 to 36,500 whole periods.");
  const count = Number(value);
  if (unit === "days" || unit === "weeks")
    return addDays(date, count * (unit === "weeks" ? 7 : 1));
  if (unit !== "months" && unit !== "years")
    throw new Error("Choose a supported loan length.");
  const [year, month, day] = date.split("-").map(Number);
  const absoluteMonth =
    year * 12 + month - 1 + count * (unit === "years" ? 12 : 1);
  const nextYear = Math.floor(absoluteMonth / 12),
    nextMonth = absoluteMonth % 12;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
  return civilDate(
    String(nextYear).padStart(4, "0") +
      "-" +
      String(nextMonth + 1).padStart(2, "0") +
      "-" +
      String(Math.min(day, lastDay)).padStart(2, "0"),
  );
}
