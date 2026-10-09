import { createHash } from "node:crypto";
import { Instant, type RecordData } from "../shared/runtime.ts";
import { HttpsError } from "../shared/errors.ts";
import type { OwnerCommandContext } from "../shared/commands.ts";
import { identifier, revision } from "../shared/validation.ts";
import { leaseMatches } from "./leases.ts";

export function recurringJobId(uid: string, obligationId: string): string {
  return `recurrence-${
    createHash("sha256").update(
      JSON.stringify([identifier(uid), identifier(obligationId)]),
    ).digest("hex")
  }`;
}
export function periodJobId(
  uid: string,
  instanceId: string,
  kind: "automaticDeduction" | "reminderPreparation",
): string {
  return `${kind}-${
    createHash("sha256").update(
      JSON.stringify([identifier(uid), identifier(instanceId), kind]),
    ).digest("hex")
  }`;
}
export async function stageRecurringJob(
  context: OwnerCommandContext,
  obligationId: string,
  targetRevision: number,
  now: Date,
): Promise<number> {
  const id = recurringJobId(context.uid, obligationId),
    job = await context.readSystemJob(id);
  if (
    job &&
    (job.kind !== "recurringGeneration" || job.subjectId !== obligationId)
  ) throw new HttpsError("failed-precondition", "Schedule needs recovery.");
  const generation = job ? revision(job.generation) + 1 : 1;
  context.systemJob(id, {
    kind: "recurringGeneration",
    subjectId: obligationId,
    targetRevision,
    generation,
    status: "pending",
    nextRunAt: Instant.fromDate(now),
    attempts: 0,
    leaseToken: null,
    leaseGeneration: null,
    leaseExpiresAt: null,
    lastError: null,
  }, job !== null);
  return generation;
}
export function assertRecurringLease(
  job: RecordData,
  token: string,
  targetRevision: number,
  now: Date,
): void {
  if (
    !leaseMatches(job as Parameters<typeof leaseMatches>[0], token) ||
    !(job.leaseExpiresAt instanceof Instant) ||
    job.leaseExpiresAt.toMillis() <= now.getTime() ||
    job.targetRevision !== targetRevision
  ) {
    throw new HttpsError("aborted", "This schedule job changed.");
  }
}
