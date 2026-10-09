import { createHash } from "node:crypto";
import { Instant } from "../shared/runtime.ts";
import { HttpsError } from "../shared/errors.ts";
import type { OwnerCommandContext } from "../shared/commands.ts";
import { identifier, revision } from "../shared/validation.ts";

export function reminderReconciliationId(uid: string): string {
  return `reminderOwner-${
    createHash("sha256").update(identifier(uid)).digest("hex")
  }`;
}
export async function stageReminderReconciliation(
  context: OwnerCommandContext,
  now = new Date(),
): Promise<void> {
  const id = reminderReconciliationId(context.uid),
    job = await context.readSystemJob(id);
  if (
    job &&
    (job.kind !== "reminderReconciliation" || job.subjectId !== context.uid)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Your reminders need recovery.",
    );
  }
  context.systemJob(id, {
    kind: "reminderReconciliation",
    subjectId: context.uid,
    generation: job ? revision(job.generation + 1) : 1,
    status: "pending",
    nextRunAt: Instant.fromDate(now),
    cursor: null,
    attempts: 0,
    leaseToken: null,
    leaseGeneration: null,
    leaseExpiresAt: null,
    lastError: null,
  }, job !== null);
}
