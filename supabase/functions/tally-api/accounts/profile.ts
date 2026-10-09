import { createHash } from "node:crypto";
import { HttpsError } from "../shared/errors.ts";
import { exactObject } from "../shared/callable.ts";
import { hasZone } from "../shared/zone_data.ts";
import {
  defaultNotificationPolicy,
  migrateNotificationPolicy,
} from "../notifications/policy.ts";
import { revision } from "../shared/validation.ts";

const currencies = ["PHP", "USD", "EUR", "SGD", "AUD", "JPY", "GBP"] as const;
const themes = ["light", "dark", "system"] as const;
type Currency = typeof currencies[number];
type Theme = typeof themes[number];
export interface ProfileView {
  userId: string;
  displayName: string;
  photoUrl: string | null;
  defaultCurrency: Currency;
  timezone: string;
  locale: string;
  themeMode: Theme;
  onboardingComplete: boolean;
  accountStatus: "active";
  revision: number;
  schemaVersion: 1;
}
export interface ProfileUpdate {
  commandId: string;
  expectedOwnerUid: string;
  expectedRevision: number;
  defaultCurrency: Currency;
  timezone: string;
  themeMode: Theme;
  onboardingComplete: boolean;
}
const categoryDefaults = [
  ["personal-loan", "Personal Loan"],
  ["rent", "Rent"],
  ["utilities", "Utilities"],
  ["subscription", "Subscription"],
  ["credit-card", "Credit Card"],
  ["insurance", "Insurance"],
  ["vehicle", "Vehicle"],
  ["education", "Education"],
  ["family", "Family"],
  ["business", "Business"],
  ["housing", "Housing"],
  ["membership", "Membership"],
  ["installment", "Installment"],
  ["other", "Other"],
] as const;

export function validateProfileUpdate(input: unknown): ProfileUpdate {
  const data = exactObject(input, [
    "commandId",
    "expectedOwnerUid",
    "expectedRevision",
    "defaultCurrency",
    "timezone",
    "themeMode",
    "onboardingComplete",
  ]);
  if (
    typeof data.commandId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(data.commandId) ||
    typeof data.expectedOwnerUid !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(data.expectedOwnerUid) ||
    typeof data.expectedRevision !== "number" ||
    !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 1 ||
    data.expectedRevision >= Number.MAX_SAFE_INTEGER ||
    !currencies.includes(data.defaultCurrency as Currency) ||
    !themes.includes(data.themeMode as Theme) ||
    typeof data.onboardingComplete !== "boolean" ||
    typeof data.timezone !== "string" || data.timezone.length > 100
  ) {
    throw new HttpsError("invalid-argument", "Check your account preferences.");
  }
  // Use the same pinned catalog offered by Flutter. Numeric offset strings
  // are absent; actual IANA aliases remain supported across runtime upgrades.
  if (!hasZone(data.timezone)) {
    throw new HttpsError("invalid-argument", "Choose a supported timezone.");
  }
  return data as unknown as ProfileUpdate;
}
