export const currencies = [
  "PHP",
  "USD",
  "EUR",
  "SGD",
  "AUD",
  "JPY",
  "GBP",
] as const;
export type Currency = (typeof currencies)[number];
export function currency(value: unknown): Currency {
  if (!currencies.includes(value as Currency))
    throw new Error("Choose a supported currency.");
  return value as Currency;
}
export function minor(value: unknown, zero = false): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < (zero ? 0 : 1) ||
    value > 1e12
  )
    throw new Error("Enter a valid amount.");
  return value;
}
export function parseMoney(value: string, code: string): number {
  const digits = currency(code) === "JPY" ? 0 : 2;
  const pattern = digits ? /^\d+(?:\.\d{1,2})?$/ : /^\d+$/;
  const text = value.trim();
  if (!pattern.test(text))
    throw new Error(
      digits ? "Use up to two decimal places." : "JPY uses whole amounts.",
    );
  const [whole, fraction = ""] = text.split(".");
  return minor(
    Number(
      BigInt(whole) * BigInt(10 ** digits) +
        BigInt(fraction.padEnd(digits, "0") || "0"),
    ),
  );
}
export function formatMoney(
  value: number | null | undefined,
  code: string,
): string {
  if (value == null) return "Amount needed";
  const c = currency(code);
  if (!Number.isSafeInteger(value) || Math.abs(value) > 1e12)
    throw new Error("Invalid money record.");
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: c,
    minimumFractionDigits: c === "JPY" ? 0 : 2,
  }).format(value / (c === "JPY" ? 1 : 100));
}
export function moneyInput(
  value: number | null | undefined,
  code: string,
): string {
  return value == null
    ? ""
    : (value / (currency(code) === "JPY" ? 1 : 100)).toFixed(
        code === "JPY" ? 0 : 2,
      );
}
export function balances(
  original: number,
  payments: number[],
): { paid: number; remaining: number } {
  minor(original);
  const paid = payments.reduce((sum, p) => sum + minor(p, true), 0);
  if (!Number.isSafeInteger(paid) || paid > original)
    throw new Error("Payment exceeds the remaining balance.");
  return { paid, remaining: original - paid };
}
export function splitCurrencies(
  rows: { currency: string; amountMinor: number }[],
): Partial<Record<Currency, number>> {
  const totals: Partial<Record<Currency, number>> = {};
  for (const row of rows) {
    const c = currency(row.currency);
    const amount = minor(row.amountMinor, true);
    totals[c] = (totals[c] ?? 0) + amount;
    if (!Number.isSafeInteger(totals[c]))
      throw new Error("Total exceeds the supported range.");
  }
  return totals;
}
