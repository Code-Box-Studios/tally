import { createHash } from "node:crypto";
import type { OwnerCommandContext } from "../shared/commands.ts";
import { Instant } from "../shared/runtime.ts";
import { identifier, localToday } from "../shared/validation.ts";
import { HttpsError } from "../shared/errors.ts";

export function projectionJobId(uid: string): string {
  return `projection-${
    createHash("sha256").update(identifier(uid)).digest("hex")
  }`;
}
export async function stageProjectionMutation(
  context: OwnerCommandContext,
  sourceRevision: number,
  now: Date,
): Promise<void> {
  const id = projectionJobId(context.uid),
    job = await context.readSystemJob(id);
  if (job && job.kind !== "ownerProjection") {
    throw new HttpsError("failed-precondition", "Projection needs recovery.");
  }
  context.systemJob(id, {
    kind: "ownerProjection",
    targetSourceRevision: sourceRevision,
    targetProfileRevision: context.profile.revision,
    targetTimezone: context.profile.timezone,
    targetDay: localToday(context.profile.timezone, now),
    generation: (job?.generation ?? 0) + 1,
    status: "pending",
    nextRunAt: Instant.fromDate(now),
    leaseToken: null,
    leaseGeneration: null,
    leaseExpiresAt: null,
    attempts: 0,
    lastErrorCode: null,
  }, job !== null);
}
