import {
  boolValue,
  civilDate,
  enumValue,
  invalid,
  revision,
} from "../shared/validation.ts";
import {
  validateScheduledTime,
  validateScheduleZone,
} from "./scheduled_time.ts";

export type RecurrenceFrequency =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "custom";
export type RecurrenceUnit = "days" | "weeks" | "months" | "years";
export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  unit: RecurrenceUnit;
  anchorDate: string;
  preferredDay: number | null;
  monthEnd: boolean;
  timezone: string;
  localDeductionTime: string;
  startDate: string;
  endDate: string | null;
  ruleVersion: number;
}
export interface RecurringOccurrence {
  index: number;
  date: string;
}
const fields = [
  "frequency",
  "interval",
  "unit",
  "anchorDate",
  "preferredDay",
  "monthEnd",
  "timezone",
  "localDeductionTime",
  "startDate",
  "endDate",
  "ruleVersion",
];
const standard: Record<
  Exclude<RecurrenceFrequency, "custom">,
  readonly [RecurrenceUnit, number]
> = {
  weekly: ["weeks", 1],
  biweekly: ["weeks", 2],
  monthly: ["months", 1],
  quarterly: ["months", 3],
  yearly: ["years", 1],
};
export function validateRecurrence(input: unknown): RecurrenceRule {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return invalid("Check the recurrence.");
  }
  const raw = input as Record<string, unknown>;
  if (
    Object.keys(raw).length !== fields.length ||
    fields.some((key) => !Object.hasOwn(raw, key))
  ) return invalid("Invalid recurrence fields.");
  const frequency = enumValue(
    raw.frequency,
    ["weekly", "biweekly", "monthly", "quarterly", "yearly", "custom"] as const,
  );
  const unit = enumValue(
    raw.unit,
    ["days", "weeks", "months", "years"] as const,
  );
  const interval = raw.interval;
  if (
    typeof interval !== "number" || !Number.isInteger(interval) ||
    interval < 1 || interval > 365
  ) return invalid("Choose an interval from 1 to 365.");
  if (
    frequency !== "custom" &&
    (standard[frequency][0] !== unit || standard[frequency][1] !== interval)
  ) return invalid("Frequency and interval do not match.");
  const calendar = unit === "months" || unit === "years";
  const preferredDay = raw.preferredDay;
  if (
    calendar
      ? typeof preferredDay !== "number" || !Number.isInteger(preferredDay) ||
        preferredDay < 1 || preferredDay > 31
      : preferredDay !== null
  ) {
    return invalid("Choose a valid preferred day.");
  }
  const monthEnd = boolValue(raw.monthEnd);
  if (monthEnd && !calendar) {
    return invalid("Month end requires a monthly or yearly rule.");
  }
  const anchorDate = civilDate(raw.anchorDate),
    startDate = civilDate(raw.startDate);
  const endDate = raw.endDate === null ? null : civilDate(raw.endDate);
  if (startDate < anchorDate || (endDate !== null && endDate < startDate)) {
    return invalid("Check the start and end dates.");
  }
  return Object.freeze({
    frequency,
    unit,
    interval,
    anchorDate,
    startDate,
    endDate,
    preferredDay: preferredDay as number | null,
    monthEnd,
    timezone: validateScheduleZone(raw.timezone),
    localDeductionTime: validateScheduledTime(raw.localDeductionTime),
    ruleVersion: revision(raw.ruleVersion),
  });
}
function parts(date: string): [number, number, number] {
  return date.split("-").map(Number) as [number, number, number];
}
function utc(date: string): number {
  const [y, m, d] = parts(date);
  return Date.UTC(y, m - 1, d);
}
function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function monthStep(rule: RecurrenceRule): number {
  return rule.interval * (rule.unit === "years" ? 12 : 1);
}
export function occurrenceAt(
  rule: RecurrenceRule,
  index: number,
): string | null {
  if (!Number.isSafeInteger(index) || index < 0 || index > 110000) {
    return invalid("Invalid recurrence cursor.");
  }
  if (rule.unit === "days" || rule.unit === "weeks") {
    const days = index * rule.interval * (rule.unit === "weeks" ? 7 : 1),
      anchor = utc(rule.anchorDate);
    if (days > (Date.UTC(2199, 11, 31) - anchor) / 86400000) return null;
    return format(new Date(anchor + days * 86400000));
  }
  const [anchorYear, anchorMonth] = parts(rule.anchorDate);
  const absolute = anchorYear * 12 + anchorMonth - 1 + index * monthStep(rule);
  const year = Math.floor(absolute / 12), month = absolute % 12;
  if (year > 2199) return null;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return format(
    new Date(
      Date.UTC(
        year,
        month,
        rule.monthEnd ? last : Math.min(rule.preferredDay!, last),
      ),
    ),
  );
}
export function nextOccurrence(
  rule: RecurrenceRule,
  afterExclusive: string | null,
): RecurringOccurrence | null {
  if (afterExclusive !== null) civilDate(afterExclusive);
  const threshold = afterExclusive !== null && afterExclusive >= rule.startDate
    ? afterExclusive
    : rule.startDate;
  let index = 0;
  if (rule.unit === "days" || rule.unit === "weeks") {
    index = Math.max(
      0,
      Math.floor(
        (utc(threshold) - utc(rule.anchorDate)) /
          (86400000 * rule.interval * (rule.unit === "weeks" ? 7 : 1)),
      ),
    );
  } else {
    const [y, m] = parts(threshold), [ay, am] = parts(rule.anchorDate);
    index = Math.max(0, Math.floor(((y - ay) * 12 + m - am) / monthStep(rule)));
  }
  // The direct lower bound needs at most the current and next anchor period.
  for (let attempt = 0; attempt < 3; attempt++, index++) {
    const date = occurrenceAt(rule, index);
    if (date === null || (rule.endDate !== null && date > rule.endDate)) {
      return null;
    }
    if (
      date >= rule.startDate &&
      (afterExclusive === null || date > afterExclusive)
    ) return { index, date };
  }
  return invalid("Invalid recurrence lower bound.");
}
export function occurrencesThrough(
  rule: RecurrenceRule,
  afterExclusive: string | null,
  through: string,
  limit = 30,
): { occurrences: RecurringOccurrence[]; hasMore: boolean } {
  civilDate(through);
  if (!Number.isInteger(limit) || limit < 1 || limit > 30) {
    return invalid("Invalid generation limit.");
  }
  const occurrences: RecurringOccurrence[] = [];
  let next = nextOccurrence(rule, afterExclusive);
  while (next !== null && next.date <= through && occurrences.length < limit) {
    occurrences.push(next);
    next = nextOccurrence(rule, next.date);
  }
  return { occurrences, hasMore: next !== null && next.date <= through };
}
