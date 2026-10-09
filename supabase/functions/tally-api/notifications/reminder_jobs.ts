import type { OwnerCommandContext } from "../shared/commands.ts";
import { Instant } from "../shared/runtime.ts";
import { periodJobId } from "../jobs/recurring_jobs.ts";

export function stageReminderPeriod(
  context: OwnerCommandContext,
  obligationId: string,
  instanceId: string,
  now: Date,
): void {
  context.systemJob(
    periodJobId(context.uid, instanceId, "reminderPreparation"),
    {
      kind: "reminderPreparation",
      subjectId: instanceId,
      obligationId,
      status: "pending",
      generation: 1,
      nextRunAt: Instant.fromDate(now),
      targetRevision: 1,
      targetParentRevision: 1,
      attempts: 0,
      leaseToken: null,
      leaseGeneration: null,
      leaseExpiresAt: null,
      lastError: null,
    },
    false,
  );
}
