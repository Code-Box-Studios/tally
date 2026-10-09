import { Audit, type CommandDatabase, Instant } from "../shared/runtime.ts";
import { HttpsError } from "../shared/errors.ts";
import { exactObject } from "../shared/callable.ts";
import { executeMetadataCommand } from "../shared/commands.ts";
import { identifier, revision } from "../shared/validation.ts";

export async function markReminderRead(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  return executeMetadataCommand(uid, input, "markReminderRead", (input) => {
    const raw = exactObject(input, ["reminderId", "expectedRevision"]);
    return {
      reminderId: identifier(raw.reminderId),
      expectedRevision: revision(raw.expectedRevision),
    };
  }, async (context, payload) => {
    const current = await context.read("reminders", payload.reminderId);
    if (
      current.reminderId !== payload.reminderId || current.visible !== true ||
      current.status === "cancelled" ||
      !(current.scheduledAt instanceof Instant) ||
      current.scheduledAt.toMillis() > Date.now()
    ) {
      throw new HttpsError(
        "failed-precondition",
        "This reminder is unavailable.",
      );
    }
    if (revision(current.revision) !== payload.expectedRevision) {
      throw new HttpsError(
        "aborted",
        "This reminder changed. Refresh and try again.",
      );
    }
    const reminderRevision = current.readAt === null
      ? revision(current.revision + 1)
      : current.revision;
    if (current.readAt === null) {
      context.update("reminders", payload.reminderId, {
        readAt: Audit.serverTimestamp(),
        revision: reminderRevision,
      });
    }
    return { reminderId: payload.reminderId, reminderRevision };
  }, db);
}
