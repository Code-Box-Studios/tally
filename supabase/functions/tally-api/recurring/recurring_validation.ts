import { exactObject } from "../shared/callable.ts";
import {
  boolValue,
  civilDate,
  type Currency,
  currencyCode,
  enumValue,
  identifier,
  invalid,
  moneyMinor,
  nullableId,
  revision,
  textValue,
} from "../shared/validation.ts";
import { type RecurrenceRule, validateRecurrence } from "./recurrence.ts";
import { validateScheduledTime } from "./scheduled_time.ts";

export interface ReminderPolicy {
  enabled: boolean;
  offsetDays: number[];
  localTime: string;
}
export interface RecurringInput {
  title: string;
  description: string;
  notes: string;
  contactId: string | null;
  categoryId: string;
  currency: Currency;
  amountKind: "fixed" | "variable";
  defaultAmountMinor: number | null;
  paymentMode: "manual" | "automatic" | "automaticConfirmation";
  paymentSourceId: string | null;
  recurrence: RecurrenceRule;
  reminderPolicy: ReminderPolicy;
}
const fields = [
  "title",
  "description",
  "notes",
  "contactId",
  "categoryId",
  "currency",
  "amountKind",
  "defaultAmountMinor",
  "paymentMode",
  "paymentSourceId",
  "recurrence",
  "reminderPolicy",
];
function validateTerms(input: unknown): RecurringInput {
  const raw = exactObject(input, fields),
    amountKind = enumValue(raw.amountKind, ["fixed", "variable"] as const);
  const amount = raw.defaultAmountMinor === null
    ? null
    : moneyMinor(raw.defaultAmountMinor);
  if (amountKind === "fixed" && amount === null) {
    return invalid("Enter the fixed bill amount.");
  }
  const reminder = exactObject(raw.reminderPolicy, [
    "enabled",
    "offsetDays",
    "localTime",
  ]);
  if (
    !Array.isArray(reminder.offsetDays) || reminder.offsetDays.length > 8 ||
    new Set(reminder.offsetDays).size !== reminder.offsetDays.length ||
    reminder.offsetDays.some((day) =>
      !Number.isInteger(day) || day < 0 || day > 365
    )
  ) {
    return invalid(
      "Choose up to eight distinct reminder offsets from 0 to 365 days.",
    );
  }
  return {
    title: textValue(raw.title, 120, true),
    description: textValue(raw.description, 1000),
    notes: textValue(raw.notes, 4000),
    contactId: nullableId(raw.contactId),
    categoryId: identifier(raw.categoryId),
    currency: currencyCode(raw.currency),
    amountKind,
    defaultAmountMinor: amount,
    paymentMode: enumValue(
      raw.paymentMode,
      ["manual", "automatic", "automaticConfirmation"] as const,
    ),
    paymentSourceId: nullableId(raw.paymentSourceId),
    recurrence: validateRecurrence(raw.recurrence),
    reminderPolicy: {
      enabled: boolValue(reminder.enabled),
      offsetDays: reminder.offsetDays as number[],
      localTime: validateScheduledTime(reminder.localTime),
    },
  };
}
export function validateRecurringCreation(input: unknown): RecurringInput {
  const result = validateTerms(input);
  if (result.recurrence.ruleVersion !== 1) {
    return invalid("A new schedule starts with rule version 1.");
  }
  return result;
}
export function validateRecurringEdit(input: unknown) {
  const raw = exactObject(input, [
    "obligationId",
    "expectedRevision",
    ...fields,
  ]);
  const { obligationId, expectedRevision, ...body } = raw;
  return {
    ...validateTerms(body),
    obligationId: identifier(obligationId),
    expectedRevision: revision(expectedRevision),
  };
}
export interface PauseRange {
  startDate: string;
  endDate: string | null;
}
export interface RecurringState {
  rule: RecurrenceRule;
  generationCursor: number;
  generatedThrough: string | null;
  pauseRanges: PauseRange[];
  endedOn: string | null;
}
export function readRecurringState(input: unknown): RecurringState {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return invalid("Invalid recurring schedule.");
  }
  const {
    generationCursor,
    generatedThrough,
    pauseRanges,
    endedOn,
    ...rawRule
  } = input as Record<string, unknown>;
  const rule = validateRecurrence(rawRule);
  if (
    typeof generationCursor !== "number" ||
    !Number.isInteger(generationCursor) || generationCursor < -1 ||
    generationCursor > 110000
  ) return invalid("Invalid schedule cursor.");
  const through = generatedThrough === null
    ? null
    : civilDate(generatedThrough);
  if (!Array.isArray(pauseRanges) || pauseRanges.length > 120) {
    return invalid("Too many pause ranges.");
  }
  let previous: string | null = null;
  const ranges = pauseRanges.map((range, index): PauseRange => {
    const raw = exactObject(range, ["startDate", "endDate"]),
      startDate = civilDate(raw.startDate),
      endDate = raw.endDate === null ? null : civilDate(raw.endDate);
    if (
      (endDate !== null && endDate <= startDate) ||
      (index > 0 && (previous === null || startDate < previous)) ||
      (endDate === null && index !== pauseRanges.length - 1)
    ) return invalid("Invalid pause ranges.");
    previous = endDate;
    return { startDate, endDate };
  });
  return {
    rule,
    generationCursor,
    generatedThrough: through,
    pauseRanges: ranges,
    endedOn: endedOn === null ? null : civilDate(endedOn),
  };
}
export function stateDocument(state: RecurringState): Record<string, unknown> {
  return {
    ...state.rule,
    generationCursor: state.generationCursor,
    generatedThrough: state.generatedThrough,
    pauseRanges: state.pauseRanges,
    endedOn: state.endedOn,
  };
}
