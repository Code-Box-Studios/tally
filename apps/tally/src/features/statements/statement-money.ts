import { currency } from "../../core/domain/money";

/** Adds nonnegative minor-unit totals without applying an individual record's amount cap. */
export function addStatementTotals(left: number, right: number): number {
  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    left < 0 ||
    right < 0 ||
    right > Number.MAX_SAFE_INTEGER - left
  ) {
    throw new Error("Statement total exceeds the supported range.");
  }
  return left + right;
}

/** Formats exact aggregate minor units, preserving cents before any numeric currency formatting. */
export function formatStatementMoney(
  value: number | null | undefined,
  code: string,
): string {
  if (value == null) return "Amount needed";
  if (!Number.isSafeInteger(value))
    throw new Error("Invalid statement amount.");
  const c = currency(code),
    digits = c === "JPY" ? 0 : 2;
  const scale = digits ? 100n : 1n;
  const units = BigInt(Math.abs(value)),
    whole = Number(units / scale);
  const fraction = (units % scale).toString().padStart(digits, "0");
  const parts = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: c,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).formatToParts(value < 0 ? -whole : whole);
  return parts
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}
