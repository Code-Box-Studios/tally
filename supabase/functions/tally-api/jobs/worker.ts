import { createHash, timingSafeEqual } from "node:crypto";
import { CommandDatabase } from "../shared/database.ts";
import { databaseError, HttpsError } from "../shared/errors.ts";
import { executeMetadataCommand } from "../shared/commands.ts";
import { Instant } from "../shared/runtime.ts";
import { leaseMatches } from "./leases.ts";
import { generateRecurringBatch } from "../recurring/generation.ts";
import { processAutomatic } from "../recurring/automatic_service.ts";
import { projectOwner } from "../dashboard/projector.ts";

import {
  deliverReminder,
  prepareReminders,
  reconcileReminders,
} from "../notifications/engine.ts";

import { deliverPush } from "../notifications/push_worker.ts";
import { cleanupFile } from "../attachments/cleanup.ts";

export const jobKinds = [
  "recurringGeneration",
  "automaticDeduction",
  "ownerProjection",
  "reminderReconciliation",
  "reminderPreparation",
  "reminderDelivery",
  "fileCleanup",
  "reminderPush",
];
export function authorizedWorker(request: Request): boolean {
  const configured = Deno.env.get("TALLY_JOB_SECRET");
  const local = Deno.env.get("SUPABASE_URL") === "http://kong:8000";
  const secret = configured ??
    (local ? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") : undefined);
  const supplied = configured
    ? request.headers.get("x-tally-job-secret")
    : local
    ? (request.headers.get("x-tally-job-secret") ??
      request.headers.get("authorization")?.replace(/^Bearer /, ""))
    : undefined;
  if (!secret || !supplied) return false;
  const a = new TextEncoder().encode(secret),
    b = new TextEncoder().encode(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function releaseFailed(
  id: string,
  token: string,
  db: CommandDatabase,
  error: unknown,
) {
  const initial = await db.readJob(id);
  if (!initial) return;
  const uid = initial.userId,
    commandId = `retry-${
      createHash("sha256").update(JSON.stringify([id, token])).digest("hex")
    }`;
  await executeMetadataCommand(
    uid,
    { commandId, expectedOwnerUid: uid, payload: { id, token } },
    "retryJob",
    (value) => value,
    async (context) => {
      const job = await context.readSystemJob(id);
      if (
        !job || !leaseMatches(job as Parameters<typeof leaseMatches>[0], token)
      ) return { released: false };
      const attempts = job.attempts ?? 1;
      const code = error instanceof HttpsError ? error.code : "unavailable";
      context.systemJob(id, {
        status: "pending",
        nextRunAt: Instant.fromMillis(
          Date.now() + Math.min(3600, 5 * 2 ** Math.min(attempts, 10)) * 1000,
        ),
        leaseToken: null,
        leaseGeneration: null,
        leaseExpiresAt: null,
        lastErrorCode: code,
      }, true);
      return { released: true };
    },
    db,
  );
}
export async function runJobs(db: CommandDatabase, maximum = 40) {
  let processed = 0, failed = 0;
  for (let batch = 0; batch < 8 && processed + failed < maximum; batch++) {
    const { data, error } = await db.client.rpc("tally_claim_jobs", {
      kinds: jobKinds,
      take: Math.min(5, maximum - processed - failed),
    });
    if (error) throw databaseError(error);
    if (!data.length) break;
    for (const entry of data) {
      const token = entry.data.leaseToken;
      try {
        if (entry.data.kind === "recurringGeneration") {
          await generateRecurringBatch(entry.id, token, db);
        } else if (entry.data.kind === "automaticDeduction") {
          await processAutomatic(entry.id, token, db);
        } else if (entry.data.kind === "ownerProjection") {
          await projectOwner(entry.id, token, db);
        } else if (entry.data.kind === "reminderReconciliation") {
          await reconcileReminders(entry.id, token, db);
        } else if (entry.data.kind === "reminderPreparation") {
          await prepareReminders(entry.id, token, db);
        } else if (entry.data.kind === "reminderDelivery") {
          await deliverReminder(entry.id, token, db);
        } else if (entry.data.kind === "reminderPush") {
          await deliverPush(entry.id, token, db);
        } else if (entry.data.kind === "fileCleanup") {
          await cleanupFile(entry.id, token, db);
        }
        processed++;
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "tallyJobFailed",
            kind: entry.data.kind,
            code: error instanceof HttpsError ? error.code : "unavailable",
          }),
        );
        failed++;
        await releaseFailed(entry.id, token, db, error).catch(() => undefined);
      }
    }
  }
  return { processed, failed };
}
