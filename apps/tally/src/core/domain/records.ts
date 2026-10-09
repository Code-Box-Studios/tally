import { currency, minor } from "./money";
export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export type Data = Record<string, Json>;
export type Collection =
  | "obligations"
  | "obligationInstances"
  | "contacts"
  | "payments"
  | "paymentSources"
  | "categories"
  | "activities"
  | "summaries"
  | "ledgerState"
  | "deductionAttempts"
  | "paymentEvidence"
  | "reminders"
  | "notificationPreferences"
  | "attachments";
export interface Row {
  id: string;
  data: Data;
}
export interface Profile {
  userId: string;
  schemaVersion: 1;
  revision: number;
  defaultCurrency: string;
  timezone: string;
  themeMode: "light" | "dark" | "system";
  displayName: string;
  onboardingComplete: boolean;
  accountStatus: "active";
}
export function object(value: unknown): Data {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Unverified data.");
  return value as Data;
}
export function decodeRow(value: unknown, owner: string): Row {
  const row = object(value),
    data = object(row.data);
  if (
    typeof row.id !== "string" ||
    !row.id ||
    data.userId !== owner ||
    data.schemaVersion !== 1
  )
    throw new Error("Unverified owner record.");
  if (data.currency != null) currency(data.currency);
  for (const key of [
    "amountMinor",
    "originalAmountMinor",
    "totalPaidMinor",
    "remainingMinor",
    "defaultAmountMinor",
  ])
    if (data[key] != null) minor(data[key], true);
  if (
    data.revision != null &&
    (!Number.isSafeInteger(data.revision) || Number(data.revision) < 1)
  )
    throw new Error("Invalid revision.");
  return { id: row.id, data };
}
export function decodeProfile(value: unknown, owner: string): Profile {
  const data = object(value);
  currency(data.defaultCurrency);
  if (
    data.userId !== owner ||
    data.schemaVersion !== 1 ||
    data.accountStatus !== "active" ||
    !Number.isSafeInteger(data.revision) ||
    Number(data.revision) < 1 ||
    typeof data.timezone !== "string" ||
    !["light", "dark", "system"].includes(String(data.themeMode)) ||
    typeof data.onboardingComplete !== "boolean"
  )
    throw new Error("Your account is unavailable.");
  new Intl.DateTimeFormat("en", { timeZone: data.timezone });
  return data as unknown as Profile;
}
export function text(data: Data, key: string, fallback = ""): string {
  return typeof data[key] === "string" ? (data[key] as string) : fallback;
}
export function amount(data: Data, key: string): number | null {
  return typeof data[key] === "number" ? (data[key] as number) : null;
}
export function recordTitle(row: Row): string {
  return text(
    row.data,
    "title",
    text(row.data, "displayName", text(row.data, "name", "Untitled")),
  );
}
export function label(value: string): string {
  const friendly: Record<string, string> = {
    iOwe: "I Owe",
    owedByMe: "I Owe",
    owedToMe: "Owed to Me",
    monthlyDues: "Monthly Dues",
    automaticConfirmation: "Auto · confirm",
    automatic: "Auto deduct",
    manual: "Manual",
    partiallyPaid: "Partially paid",
    bankAccount: "Bank account",
    creditCard: "Credit card",
    debitCard: "Debit card",
    eWallet: "E-wallet",
    bankTransfer: "Bank transfer",
  };
  return (
    friendly[value] ??
    value
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, (c) => c.toUpperCase())
  );
}
