import { createHash } from "node:crypto";
import { Instant, type RecordData } from "../shared/runtime.ts";
import type { OwnerCommandContext } from "../shared/commands.ts";
import { HttpsError } from "../shared/errors.ts";
import {
  boolValue,
  currencyCode,
  enumValue,
  identifier,
  moneyMinor,
  nullableDate,
  revision,
  textValue,
} from "../shared/validation.ts";
import { exactObject } from "../shared/callable.ts";
import {
  validateScheduledTime,
  validateScheduleZone,
} from "../recurring/scheduled_time.ts";
import type { ReminderPolicy } from "../recurring/recurring_validation.ts";
import {
  type NotificationPolicy,
  validateNotificationPolicy,
  validateOffsets,
} from "./policy.ts";
import type { ReminderSubject } from "./schedule.ts";

export const reminderRecovery = (): never => {
  throw new HttpsError("failed-precondition", "Your reminders need recovery.");
};
export function owned(uid: string, data: RecordData | undefined): RecordData {
  if (!data || data.userId !== uid || data.schemaVersion !== 1) {
    return reminderRecovery();
  }
  return data;
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export interface ReminderOwnerContext {
  uid: string;
  profile: RecordData;
  preferences: NotificationPolicy;
  preferenceRevision: number;
  ownerKey: string;
}
export async function readReminderOwner(
  context: OwnerCommandContext,
): Promise<ReminderOwnerContext> {
  const uid = context.uid,
    profile = owned(uid, context.profile),
    pref = await context.read("notificationPreferences", "default"),
    ledger = await context.read("ledgerState", "current");
  if (
    profile.accountStatus !== "active" ||
    !Number.isSafeInteger(ledger.revision) || ledger.revision < 0
  ) return reminderRecovery();
  const preferences = validateNotificationPolicy(Object.fromEntries([
    "enabled",
    "enabledKinds",
    "offsetDays",
    "localTime",
    "quietStart",
    "quietEnd",
    "pushEnabled",
    "localEnabled",
    "allowSensitivePushText",
    "timezonePolicy",
  ].map((key) => [key, pref[key]])));
  const preferenceRevision = revision(pref.revision);
  return {
    uid,
    profile,
    preferences,
    preferenceRevision,
    ownerKey: hash([
      uid,
      ledger.revision,
      profile.revision,
      profile.timezone,
      preferenceRevision,
    ]),
  };
}
export interface ReminderContext extends ReminderOwnerContext {
  instance: RecordData;
  parent: RecordData;
  subject: ReminderSubject;
  contextKey: string;
  policyRevision: number;
  title: string;
  currency: string;
}
function validateReminder(input: unknown): ReminderPolicy {
  const saved = typeof input === "object" && input !== null &&
    Object.hasOwn(input, "preferenceRevision");
  const raw = exactObject(input, [
    "enabled",
    "offsetDays",
    "localTime",
    ...(saved ? ["preferenceRevision"] : []),
  ]);
  if (saved) revision(raw.preferenceRevision);
  return {
    enabled: boolValue(raw.enabled),
    offsetDays: [...validateOffsets(raw.offsetDays)],
    localTime: validateScheduledTime(raw.localTime),
  };
}
export async function readReminderContext(
  command: OwnerCommandContext,
  instanceId: string,
): Promise<ReminderContext> {
  const [owner, instanceDoc] = await Promise.all([
    readReminderOwner(command),
    command.read("obligationInstances", identifier(instanceId)),
  ]);
  const instance = owned(owner.uid, instanceDoc),
    obligationId = identifier(instance.obligationId);
  const parent = owned(
    owner.uid,
    await command.read("obligations", obligationId),
  );
  if (
    instance.instanceId !== instanceId ||
    parent.obligationId !== obligationId ||
    parent.currency !== instance.currency ||
    typeof instance.closed !== "boolean"
  ) return reminderRecovery();
  revision(instance.revision);
  revision(parent.revision);
  enumValue(
    parent.lifecycle,
    ["active", "paused", "ended", "cancelled"] as const,
  );
  enumValue(
    instance.financialStatus,
    [
      "active",
      "pending",
      "partiallyPaid",
      "paid",
      "overdue",
      "skipped",
      "cancelled",
    ] as const,
  );
  const currency = currencyCode(instance.currency);
  if (
    !Number.isSafeInteger(instance.totalPaidMinor) ||
    instance.totalPaidMinor < 0
  ) return reminderRecovery();
  if (instance.amountState === "known") {
    moneyMinor(instance.amountMinor);
    if (
      instance.totalPaidMinor > instance.amountMinor ||
      instance.remainingMinor !== instance.amountMinor - instance.totalPaidMinor
    ) return reminderRecovery();
  } else if (
    instance.amountState !== "unknown" || instance.amountMinor !== null ||
    instance.remainingMinor !== null || instance.totalPaidMinor !== 0
  ) return reminderRecovery();
  const recurring = ["recurringDue", "subscription"].includes(parent.type);
  const policy: ReminderPolicy | null = recurring
    ? validateReminder(instance.snapshot?.reminderPolicy)
    : parent.reminderRevision !== undefined
    ? validateReminder(parent.reminderPolicy)
    : null;
  const policyRevision = recurring
    ? revision(instance.templateRevision)
    : parent.reminderRevision === undefined
    ? 1
    : revision(parent.reminderRevision);
  const timezone = validateScheduleZone(instance.timezone),
    dueDate = nullableDate(instance.dueDate);
  const title = textValue(
    recurring ? instance.snapshot?.title : parent.title,
    120,
    true,
  );
  const subject: ReminderSubject = {
    instanceId,
    obligationId,
    section: enumValue(
      instance.section,
      ["iOwe", "owedToMe", "monthlyDues"] as const,
    ),
    dueDate,
    timezone,
    paymentMode: enumValue(
      instance.paymentMode,
      ["manual", "automatic", "automaticConfirmation"] as const,
    ),
    closed: parent.lifecycle === "cancelled" || instance.closed ||
      ["paid", "skipped", "cancelled"].includes(instance.financialStatus),
    amountMinor: instance.amountMinor,
    remainingMinor: instance.remainingMinor,
    requiresDeductionConfirmation:
      instance.requiresDeductionConfirmation === true,
    reminderPolicy: policy,
    confirmationAt: instance.deductionAt instanceof Instant
      ? instance.deductionAt.toDate()
      : null,
  };
  return {
    ...owner,
    instance,
    parent,
    subject,
    policyRevision,
    title,
    currency,
    contextKey: hash([
      owner.uid,
      instanceId,
      parent.revision,
      instance.revision,
      owner.profile.revision,
      owner.profile.timezone,
      owner.preferenceRevision,
      policyRevision,
    ]),
  };
}
