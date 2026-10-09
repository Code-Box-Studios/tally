import type { CommandDatabase } from "../shared/runtime.ts";
import { HttpsError } from "../shared/errors.ts";
import { exactObject } from "../shared/callable.ts";
import { executeMetadataCommand } from "../shared/commands.ts";
import { boolValue, identifier, revision } from "../shared/validation.ts";
import { validateScheduledTime } from "../recurring/scheduled_time.ts";
import { validateNotificationPolicy, validateOffsets } from "./policy.ts";
import { stageReminderReconciliation } from "./reconciliation_job.ts";

export async function updateNotificationPreferences(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  return executeMetadataCommand(
    uid,
    input,
    "updateNotificationPreferences",
    (input) => {
      const raw = exactObject(input, ["expectedRevision", "preferences"]);
      return {
        expectedRevision: revision(raw.expectedRevision),
        preferences: validateNotificationPolicy(raw.preferences),
      };
    },
    async (context, payload) => {
      const current = await context.read("notificationPreferences", "default");
      if (
        revision(current.revision) !== payload.expectedRevision
      ) {
        throw new HttpsError(
          "aborted",
          "Your reminders changed on another device. Refresh and try again.",
        );
      }
      const preferenceRevision = revision(current.revision + 1);
      await stageReminderReconciliation(context);
      context.update("notificationPreferences", "default", {
        ...payload.preferences,
        revision: preferenceRevision,
      });
      return { preferenceRevision };
    },
    db,
  );
}
export async function setObligationReminder(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  return executeMetadataCommand(
    uid,
    input,
    "setObligationReminder",
    (input) => {
      const raw = exactObject(input, [
        "obligationId",
        "expectedRevision",
        "reminderPolicy",
      ]);
      const policy = exactObject(raw.reminderPolicy, [
        "enabled",
        "offsetDays",
        "localTime",
      ]);
      return {
        obligationId: identifier(raw.obligationId),
        expectedRevision: revision(raw.expectedRevision),
        reminderPolicy: {
          enabled: boolValue(policy.enabled),
          offsetDays: validateOffsets(policy.offsetDays),
          localTime: validateScheduledTime(policy.localTime),
        },
      };
    },
    async (context, payload) => {
      const parent = await context.read("obligations", payload.obligationId);
      if (
        parent.obligationId !== payload.obligationId ||
        !["iOwe", "owedToMe"].includes(parent.section)
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Use recurring bill settings for this schedule.",
        );
      }
      if (
        revision(parent.revision) !== payload.expectedRevision
      ) {
        throw new HttpsError(
          "aborted",
          "This obligation changed. Refresh and try again.",
        );
      }
      const obligationRevision = revision(parent.revision + 1),
        reminderRevision = parent.reminderRevision === undefined
          ? 1
          : revision(parent.reminderRevision + 1);
      await stageReminderReconciliation(context);
      context.update("obligations", payload.obligationId, {
        reminderPolicy: payload.reminderPolicy,
        reminderRevision,
        revision: obligationRevision,
      });
      return {
        obligationId: payload.obligationId,
        obligationRevision,
        reminderRevision,
      };
    },
    db,
  );
}
