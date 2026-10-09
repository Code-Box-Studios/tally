import type { CommandDatabase, RecordData } from "../shared/runtime.ts";
import { HttpsError } from "../shared/errors.ts";
import { exactObject } from "../shared/callable.ts";
import {
  executeOwnerCommand,
  type OwnerCommandContext,
} from "../shared/commands.ts";
import {
  civilDate,
  enumValue,
  identifier,
  invalid,
  localToday,
  revision,
} from "../shared/validation.ts";
import { references } from "../obligations/obligation_service.ts";
import { stageRecurringJob } from "../jobs/recurring_jobs.ts";
import {
  nextOccurrence,
  type RecurrenceRule,
  validateRecurrence,
} from "./recurrence.ts";
import { periodDocument, stagePeriod } from "./period_document.ts";
import {
  readRecurringState,
  type RecurringInput,
  type RecurringState,
  stateDocument,
  validateRecurringCreation,
  validateRecurringEdit,
} from "./recurring_validation.ts";

export function addCivilDays(date: string, days: number): string {
  const [y, m, d] = civilDate(date).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const value = new Date(Date.UTC(y, m - 1, d + days));
  return value.getUTCFullYear() > 2199
    ? "2199-12-31"
    : civilDate(value.toISOString().slice(0, 10));
}
export async function readRecurringParent(
  context: OwnerCommandContext,
  id: string,
): Promise<RecordData> {
  const parent = await context.read("obligations", id);
  if (
    parent.obligationId !== id ||
    !["recurringDue", "subscription"].includes(parent.type) ||
    !["active", "paused", "ended"].includes(parent.lifecycle) ||
    parent.originalAmountMinor !== null || parent.totalPaidMinor !== null ||
    parent.remainingMinor !== null
  ) {
    throw new HttpsError(
      "failed-precondition",
      "This recurring obligation is unavailable.",
    );
  }
  readRecurringState(parent.recurrence);
  return parent;
}
async function preferences(
  context: OwnerCommandContext,
  input: RecurringInput,
) {
  const current =
    await context.maybeRead("notificationPreferences", "default") ??
      await context.read("notificationPreferences", "current");
  return {
    ...input.reminderPolicy,
    preferenceRevision: revision(current.revision),
  };
}
function activityMoney(
  amount: number | null,
  currency: string,
): Record<string, unknown> {
  return {
    amountMinor: amount,
    currency: amount === null ? null : currency,
    obligationCurrency: currency,
  };
}
export async function createRecurring(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  return executeOwnerCommand(
    uid,
    input,
    "createRecurring",
    validateRecurringCreation,
    async (context, payload) => {
      const now = new Date(),
        snapshots = await references(context, payload),
        reminderPolicy = await preferences(context, payload);
      const obligationId = context.id("obligation"),
        state: RecurringState = {
          rule: payload.recurrence,
          generationCursor: -1,
          generatedThrough: null,
          pauseRanges: [],
          endedOn: null,
        };
      const first = nextOccurrence(state.rule, null),
        horizon = addCivilDays(localToday(state.rule.timezone, now), 90);
      const parent: RecordData = {
        ...payload,
        ...snapshots,
        reminderPolicy,
        obligationId,
        type: "recurringDue",
        direction: "owedByMe",
        section: "monthlyDues",
        timezone: state.rule.timezone,
        originationDate: state.rule.startDate,
        dueDate: null,
        nextDueDate: null,
        nextGenerationDate: first?.date ?? null,
        originalAmountMinor: null,
        totalPaidMinor: null,
        remainingMinor: null,
        singleInstanceId: null,
        interestInfo: null,
        lifecycle: "active",
        financialStatus: "active",
        archived: false,
        hasPaymentHistory: false,
        revision: 1,
      };
      let period: RecordData | null = null;
      if (first && first.date <= horizon) {
        period = periodDocument(parent, state.rule, first.date, now);
        state.generationCursor = first.index;
        state.generatedThrough = first.date;
      }
      const generationRevision = await stageRecurringJob(
        context,
        obligationId,
        1,
        now,
      );
      context.create("obligations", obligationId, {
        ...parent,
        recurrence: stateDocument(state),
      });
      if (period) stagePeriod(context, parent, period, now);
      context.activity("obligationCreated", {
        obligationId,
        title: payload.title,
        ...activityMoney(
          payload.amountKind === "fixed" ? payload.defaultAmountMinor : null,
          payload.currency,
        ),
        direction: "owedByMe",
      });
      return {
        obligationId,
        obligationRevision: 1,
        firstInstanceId: period?.instanceId ?? null,
        generationRevision,
      };
    },
    db,
  );
}
function comparable(rule: RecurrenceRule): string {
  const { ruleVersion, ...terms } = rule;
  return JSON.stringify(terms);
}
export async function editRecurring(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  return executeOwnerCommand(
    uid,
    input,
    "editRecurring",
    validateRecurringEdit,
    async (context, payload) => {
      const parent = await readRecurringParent(context, payload.obligationId),
        state = readRecurringState(parent.recurrence);
      if (parent.revision !== payload.expectedRevision) {
        throw new HttpsError(
          "aborted",
          "This bill changed. Refresh and try again.",
        );
      }
      if (parent.lifecycle === "ended") {
        throw new HttpsError(
          "failed-precondition",
          "An ended schedule keeps its history.",
        );
      }
      if (
        state.generatedThrough !== null && parent.currency !== payload.currency
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Existing periods keep their currency.",
        );
      }
      if (payload.recurrence.anchorDate !== state.rule.anchorDate) {
        throw new HttpsError(
          "failed-precondition",
          "Keep the original schedule anchor.",
        );
      }
      let rule = payload.recurrence;
      if (comparable(rule) !== comparable(state.rule)) {
        const cutover = state.generatedThrough === null
          ? rule.startDate
          : addCivilDays(state.generatedThrough, 1);
        if (state.generatedThrough === "2199-12-31") {
          throw new HttpsError(
            "failed-precondition",
            "There is no later supported billing date.",
          );
        }
        rule = validateRecurrence({
          ...rule,
          startDate: rule.startDate > cutover ? rule.startDate : cutover,
          ruleVersion: revision(state.rule.ruleVersion) + 1,
        });
        state.rule = rule;
        const next = nextOccurrence(rule, state.generatedThrough);
        state.generationCursor = next ? next.index - 1 : 110000;
      } else rule = state.rule;
      const snapshots = await references(context, payload, {
        contactId: parent.contactId,
        categoryId: parent.categoryId,
        paymentSourceId: parent.paymentSourceId,
      });
      const reminderPolicy = await preferences(context, payload),
        obligationRevision = revision(parent.revision) + 1;
      const generationRevision = await stageRecurringJob(
        context,
        payload.obligationId,
        obligationRevision,
        new Date(),
      );
      const { expectedRevision, obligationId, recurrence, ...terms } = payload;
      context.update("obligations", obligationId, {
        ...terms,
        ...snapshots,
        reminderPolicy,
        timezone: rule.timezone,
        recurrence: stateDocument(state),
        revision: obligationRevision,
      });
      context.activity("obligationChanged", {
        obligationId,
        title: payload.title,
        ...activityMoney(
          payload.amountKind === "fixed" ? payload.defaultAmountMinor : null,
          payload.currency,
        ),
        previousDefaultAmountMinor: parent.defaultAmountMinor,
        previousRecurrence: parent.recurrence,
        newRecurrence: stateDocument(state),
        futurePeriodsOnly: true,
      });
      return {
        obligationId,
        obligationRevision,
        generationRevision,
        appliesAfter: state.generatedThrough,
      };
    },
    db,
  );
}
function validateLifecycle(input: unknown) {
  const raw = exactObject(input, [
    "obligationId",
    "expectedRevision",
    "action",
    "effectiveDate",
  ]);
  return {
    obligationId: identifier(raw.obligationId),
    expectedRevision: revision(raw.expectedRevision),
    action: enumValue(raw.action, ["pause", "resume", "end"] as const),
    effectiveDate: civilDate(raw.effectiveDate),
  };
}
export async function changeRecurringLifecycle(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  return executeOwnerCommand(
    uid,
    input,
    "changeRecurringLifecycle",
    validateLifecycle,
    async (context, payload) => {
      const parent = await readRecurringParent(context, payload.obligationId),
        state = readRecurringState(parent.recurrence);
      if (parent.revision !== payload.expectedRevision) {
        throw new HttpsError(
          "aborted",
          "This bill changed. Refresh and try again.",
        );
      }
      if (
        payload.effectiveDate < localToday(state.rule.timezone)
      ) return invalid("Choose today or a future effective date.");
      let lifecycle = parent.lifecycle;
      if (payload.action === "pause") {
        const last = state.pauseRanges.at(-1);
        if (
          lifecycle !== "active" || state.pauseRanges.length >= 120 ||
          (last &&
            (last.endDate === null || payload.effectiveDate < last.endDate))
        ) {
          throw new HttpsError(
            "failed-precondition",
            "This schedule cannot be paused on that date.",
          );
        }
        state.pauseRanges.push({
          startDate: payload.effectiveDate,
          endDate: null,
        });
        lifecycle = "paused";
      } else if (payload.action === "resume") {
        const last = state.pauseRanges.at(-1);
        if (
          lifecycle !== "paused" || !last || last.endDate !== null ||
          payload.effectiveDate <= last.startDate
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Choose a resume date after the pause starts.",
          );
        }
        last.endDate = payload.effectiveDate;
        lifecycle = "active";
      } else {
        if (lifecycle === "ended") {
          throw new HttpsError(
            "failed-precondition",
            "This schedule already ended.",
          );
        }
        state.endedOn = payload.effectiveDate;
        lifecycle = "ended";
      }
      const retainedFutureCount = await context.countWhere(
        "obligationInstances",
        [
          { field: "obligationId", op: "==", value: payload.obligationId },
          {
            field: "occurrenceDate",
            op: payload.action === "end" ? ">" : ">=",
            value: payload.effectiveDate,
          },
        ],
      );
      const obligationRevision = revision(parent.revision) + 1,
        generationRevision = await stageRecurringJob(
          context,
          payload.obligationId,
          obligationRevision,
          new Date(),
        );
      context.update("obligations", payload.obligationId, {
        lifecycle,
        recurrence: stateDocument(state),
        revision: obligationRevision,
      });
      context.activity(
        payload.action === "pause"
          ? "recurringPaused"
          : payload.action === "resume"
          ? "recurringResumed"
          : "recurringEnded",
        {
          obligationId: payload.obligationId,
          title: parent.title,
          amountMinor: null,
          currency: null,
          effectiveDate: payload.effectiveDate,
          retainedFutureCount,
        },
      );
      return {
        obligationId: payload.obligationId,
        obligationRevision,
        generationRevision,
        retainedFutureCount,
      };
    },
    db,
  );
}
