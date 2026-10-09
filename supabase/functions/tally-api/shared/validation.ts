import { HttpsError } from "./errors.ts";
import { civilAt } from "./zone_data.ts";
export const currencies = [
  "PHP",
  "USD",
  "EUR",
  "SGD",
  "AUD",
  "JPY",
  "GBP",
] as const;
export type Currency = typeof currencies[number];
export function invalid(message = "Check the details and try again."): never {
  throw new HttpsError("invalid-argument", message);
}
export function identifier(value: unknown): string {
  if (
    typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value) ||
    value.includes("\n")
  ) return invalid("Invalid reference.");
  return value;
}
export function nullableId(value: unknown): string | null {
  return value === null ? null : identifier(value);
}
export function moneyMinor(value: unknown): number {
  if (
    typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 ||
    value > 1_000_000_000_000
  ) return invalid("Enter a positive supported amount.");
  return value;
}
export function currencyCode(value: unknown): Currency {
  if (!currencies.includes(value as Currency)) {
    return invalid("Choose a supported currency.");
  }
  return value as Currency;
}
export function textValue(
  value: unknown,
  max: number,
  required = false,
): string {
  if (typeof value !== "string" || value.length > max) {
    return invalid("Text is too long or invalid.");
  }
  const text = value.trim();
  if (required && !text.length) return invalid("Enter the required details.");
  return text;
}
export function nullableText(value: unknown, max: number): string | null {
  return value === null ? null : textValue(value, max);
}
export function boolValue(value: unknown): boolean {
  if (typeof value !== "boolean") return invalid();
  return value;
}
export function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
): T {
  if (!values.includes(value as T)) {
    return invalid("Choose a supported option.");
  }
  return value as T;
}
export function revision(value: unknown): number {
  if (
    typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 ||
    value >= Number.MAX_SAFE_INTEGER
  ) return invalid("Invalid record revision.");
  return value;
}
export function civilDate(value: unknown): string {
  if (
    typeof value !== "string" || value.length !== 10 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) return invalid("Enter a valid date.");
  const [year, month, day] = value.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 || year > 2199 || date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day
  ) return invalid("Enter a valid date.");
  return value;
}
export function nullableDate(value: unknown): string | null {
  return value === null ? null : civilDate(value);
}
export function localToday(timezone: string, instant = new Date()): string {
  try {
    return civilAt(instant, timezone);
  } catch {
    return invalid("Choose a valid timezone and date.");
  }
}
