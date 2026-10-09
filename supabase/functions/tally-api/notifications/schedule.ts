import { createHash } from "node:crypto";
import {
  civilDate,
  enumValue,
  identifier,
  invalid,
  localToday,
  revision,
} from "../shared/validation.ts";
import { localWallMilliseconds, zoneOffsets } from "../shared/zone_data.ts";
import {
  scheduledInstant,
  validateScheduledTime,
  validateScheduleZone,
} from "../recurring/scheduled_time.ts";
import {
  type NotificationPolicy,
  type ReminderKind,
  reminderKinds,
  validateNotificationPolicy,
  validateOffsets,
} from "./policy.ts";
import type { ReminderPolicy } from "../recurring/recurring_validation.ts";

export type ReminderPhase = "upcoming" | "due" | "overdue" | "confirmation";
export interface ReminderSubject {
  instanceId: string;
  obligationId: string;
  section: "iOwe" | "owedToMe" | "monthlyDues";
  dueDate: string | null;
  timezone: string;
  paymentMode: "manual" | "automatic" | "automaticConfirmation";
  closed: boolean;
  amountMinor: number | null;
  remainingMinor: number | null;
  requiresDeductionConfirmation: boolean;
  reminderPolicy: ReminderPolicy | null;
  confirmationAt?: Date | null;
}
export interface ReminderPlan {
  readonly kind: ReminderKind;
  readonly phase: ReminderPhase;
  readonly civilTargetDate: string;
  readonly scheduledAt: Date;
}
const dayMs = 86400000;
function dayNumber(date: string): number {
  return Date.parse(`${civilDate(date)}T00:00:00.000Z`) / dayMs;
}
function civilDay(day: number): string | null {
  const date = new Date(day * dayMs).toISOString().slice(0, 10);
  return date < "1900-01-01" || date > "2199-12-31" ? null : civilDate(date);
}
export function afterQuietHours(
  instant: Date,
  profileTimezone: string,
  quietStart: string,
  quietEnd: string,
): Date {
  validateScheduleZone(profileTimezone);
  validateScheduledTime(quietStart);
  validateScheduledTime(quietEnd);
  if (!Number.isFinite(instant.getTime())) {
    return invalid("Choose a valid reminder time.");
  }
  if (quietStart === quietEnd) return new Date(instant);
  const local = new Date(
    localWallMilliseconds(instant.getTime(), profileTimezone),
  );
  const time = local.toISOString().slice(11, 16),
    date = civilDate(local.toISOString().slice(0, 10));
  const overnight = quietStart > quietEnd;
  const quiet = overnight
    ? time >= quietStart || time < quietEnd
    : time >= quietStart && time < quietEnd;
  if (!quiet) return new Date(instant);
  const target = civilDay(
    dayNumber(date) + (overnight && time >= quietStart ? 1 : 0),
  );
  if (!target) {
    return invalid("Quiet hours extend beyond the supported calendar.");
  }
  const wall = Date.parse(`${target}T${quietEnd}:00.000Z`);
  const endings = zoneOffsets(profileTimezone).map((offset) => wall - offset)
    .filter((candidate) =>
      candidate >= instant.getTime() &&
      localWallMilliseconds(candidate, profileTimezone) === wall
    );
  // During the second occurrence of a repeated quiet hour, the first ending
  // is already past. Choose the next actual ending; a gap uses the resolver.
  return endings.length
    ? new Date(Math.min(...endings))
    : scheduledInstant(target, quietEnd, profileTimezone);
}
export function planReminders(
  subject: ReminderSubject,
  rawPreferences: NotificationPolicy,
  profileTimezone: string,
  now: Date,
): readonly ReminderPlan[] {
  const preferences = validateNotificationPolicy(rawPreferences);
  validateScheduleZone(subject.timezone);
  validateScheduleZone(profileTimezone);
  identifier(subject.instanceId);
  identifier(subject.obligationId);
  enumValue(subject.section, ["iOwe", "owedToMe", "monthlyDues"] as const);
  enumValue(
    subject.paymentMode,
    ["manual", "automatic", "automaticConfirmation"] as const,
  );
  for (const amount of [subject.amountMinor, subject.remainingMinor]) {
    if (
      amount !== null &&
      (!Number.isSafeInteger(amount) || amount < 0 || amount > 1e12)
    ) return invalid("Invalid reminder amount.");
  }
  if (
    !preferences.enabled || subject.closed || subject.remainingMinor === 0 ||
    !subject.dueDate
  ) return [];
  const policy = subject.reminderPolicy;
  if (policy?.enabled === false) return [];
  const offsets = validateOffsets(policy?.offsetDays ?? preferences.offsetDays),
    time = validateScheduledTime(policy?.localTime ?? preferences.localTime);
  const due = dayNumber(subject.dueDate),
    today = dayNumber(localToday(subject.timezone, now));
  const first = Math.max(dayNumber("1900-01-01"), today - 7),
    last = Math.min(dayNumber("2199-12-31"), today + 90);
  const plans: ReminderPlan[] = [];
  const append = (phase: ReminderPhase, day: number): void => {
    if (day < first || day > last) return;
    const target = civilDay(day);
    if (!target) return;
    const base: ReminderKind = phase === "confirmation"
      ? "automaticConfirmation"
      : phase === "overdue"
      ? "overdue"
      : phase === "due"
      ? "dueToday"
      : subject.paymentMode === "manual"
      ? "upcoming"
      : "automaticUpcoming";
    if (!preferences.enabledKinds.includes(base)) return;
    const kind = subject.section === "owedToMe" ? "owedToMe" : base;
    if (!preferences.enabledKinds.includes(kind)) return;
    const instant = phase === "confirmation" && subject.confirmationAt
      ? subject.confirmationAt
      : scheduledInstant(target, time, subject.timezone);
    plans.push(
      Object.freeze({
        kind,
        phase,
        civilTargetDate: target,
        scheduledAt: afterQuietHours(
          instant,
          profileTimezone,
          preferences.quietStart,
          preferences.quietEnd,
        ),
      }),
    );
  };
  for (const offset of offsets) {
    append(offset === 0 ? "due" : "upcoming", due - offset);
  }
  for (const offset of [1, 3, 7]) append("overdue", due + offset);
  for (
    let multiple = Math.max(2, Math.ceil((first - due) / 7));
    due + multiple * 7 <= last;
    multiple++
  ) append("overdue", due + multiple * 7);
  if (
    subject.paymentMode !== "manual" && subject.requiresDeductionConfirmation
  ) {
    const date = subject.confirmationAt
      ? localToday(subject.timezone, subject.confirmationAt)
      : subject.dueDate;
    append("confirmation", dayNumber(date));
  }
  return Object.freeze(
    plans.sort((a, b) =>
      a.scheduledAt.getTime() - b.scheduledAt.getTime() ||
      a.kind.localeCompare(b.kind)
    ),
  );
}
export function reminderId(
  uid: string,
  instanceId: string,
  kind: ReminderKind,
  date: string,
  preferenceRevision: number,
  policyRevision: number,
): string {
  const identity = [
    identifier(uid),
    identifier(instanceId),
    enumValue(kind, reminderKinds),
    civilDate(date),
    revision(preferenceRevision),
    revision(policyRevision),
  ];
  return `reminder-${
    createHash("sha256").update(JSON.stringify(identity)).digest("hex")
  }`;
}
