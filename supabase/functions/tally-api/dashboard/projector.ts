import { createHash } from "node:crypto";
import { CommandDatabase } from "../shared/database.ts";
import { executeMetadataCommand } from "../shared/commands.ts";
import { Audit, Instant } from "../shared/runtime.ts";
import { HttpsError } from "../shared/errors.ts";
import { localToday } from "../shared/validation.ts";
import { assertRecurringLease } from "../jobs/recurring_jobs.ts";
import { nextCivilBoundary } from "../jobs/leases.ts";
import { calculateProjection } from "./projection.ts";

export async function projectOwner(
  jobId: string,
  token: string,
  db: CommandDatabase,
  now = new Date(),
) {
  const initial = await db.readJob(jobId);
  if (!initial || initial.kind !== "ownerProjection") {
    throw new HttpsError("failed-precondition", "Projection job unavailable.");
  }
  const uid = initial.userId;
  const commandId = `projection-${
    createHash("sha256").update(JSON.stringify([jobId, token])).digest("hex")
  }`;
  return executeMetadataCommand(
    uid,
    { commandId, expectedOwnerUid: uid, payload: { jobId, token } },
    "projectOwner",
    (value) => value,
    async (context) => {
      const job = await context.readSystemJob(jobId);
      if (!job) {
        throw new HttpsError(
          "failed-precondition",
          "Projection job unavailable.",
        );
      }
      assertRecurringLease(job, token, job.targetRevision, new Date());
      context.beforeCommit(() =>
        assertRecurringLease(job, token, job.targetRevision, new Date())
      );
      const ledger = await context.read("ledgerState", "current");
      const [obligations, instances, payments, contacts, paymentEvidence] =
        await Promise.all(
          [
            "obligations",
            "obligationInstances",
            "payments",
            "contacts",
            "paymentEvidence",
          ].map((name) => db.scan(uid, name)),
        );
      const day = localToday(context.profile.timezone, now);
      const projection = calculateProjection({
        obligations: obligations!,
        instances: instances!,
        payments: payments!,
        contacts: contacts!,
        paymentEvidence: paymentEvidence!,
      }, {
        uid,
        timezone: context.profile.timezone,
        today: day,
        yearMonth: day.slice(0, 7),
        now,
      });
      const zones = new Set<string>([
        context.profile.timezone,
        ...instances!.map((period) => period.timezone),
      ]);
      const nextRefreshAt = new Date(
        Math.min(
          ...[...zones].map((zone) => nextCivilBoundary(zone, now).getTime()),
        ),
      );
      context.beforeCommit(() => {
        if (new Date() >= nextRefreshAt) {
          throw new HttpsError("aborted", "Financial day changed.");
        }
      });
      const records = [
        ...Object.values(projection.currencies).map((bucket) => ({
          id: `dashboard-${bucket.currency}`,
          data: { kind: "dashboard", ...bucket },
        })),
        ...Object.values(projection.contacts).map((contact) => ({
          id: `contact-${
            createHash("sha256").update(contact.contactId).digest("hex")
          }`,
          data: { kind: "contact", ...contact },
        })),
      ];
      if (records.length > 490) {
        throw new HttpsError(
          "resource-exhausted",
          "Contact totals exceed the current processing limit.",
        );
      }
      for (const record of records) {
        const prior = await context.maybeRead("summaries", record.id);
        const data = {
          ...record.data,
          sourceRevision: ledger.revision,
          profileRevision: context.profile.revision,
          formulaVersion: 1,
          yearMonth: day.slice(0, 7),
          timezone: context.profile.timezone,
          financialDay: day,
          validUntil: Instant.fromDate(nextRefreshAt),
          computedAt: Audit.serverTimestamp(),
        };
        if (prior) {
          context.update("summaries", record.id, data);
        } else context.create("summaries", record.id, data);
      }
      context.systemJob(jobId, {
        status: "pending",
        nextRunAt: Instant.fromDate(nextRefreshAt),
        generation: job.generation + 1,
        leaseToken: null,
        leaseGeneration: null,
        leaseExpiresAt: null,
        attempts: 0,
        lastErrorCode: null,
      }, true);
      return { published: true, sourceRevision: ledger.revision };
    },
    db,
  );
}
