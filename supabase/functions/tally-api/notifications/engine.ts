import { createHash } from "node:crypto";
import { CommandDatabase } from "../shared/database.ts";
import {
  executeMetadataCommand,
  type OwnerCommandContext,
} from "../shared/commands.ts";
import { Audit, Instant, type RecordData } from "../shared/runtime.ts";
import { HttpsError } from "../shared/errors.ts";
import { assertRecurringLease, periodJobId } from "../jobs/recurring_jobs.ts";
import { nextCivilBoundary } from "../jobs/leases.ts";
import { readReminderContext } from "./context.ts";
import { planReminders, reminderId } from "./schedule.ts";
import { pushJobId } from "./push_worker.ts";

export const deliveryId = (uid: string, id: string) =>
  `reminderDelivery-${
    createHash("sha256").update(JSON.stringify([uid, id])).digest("hex")
  }`;
const cleared = {
  leaseToken: null,
  leaseGeneration: null,
  leaseExpiresAt: null,
  attempts: 0,
  lastErrorCode: null,
};
async function command<R>(
  jobId: string,
  token: string,
  db: CommandDatabase,
  type: string,
  work: (context: OwnerCommandContext, job: RecordData) => Promise<R>,
): Promise<R> {
  const initial = await db.readJob(jobId);
  if (!initial) {
    throw new HttpsError("failed-precondition", "Reminder job unavailable.");
  }
  const uid = initial.userId,
    commandId = `reminder-${
      createHash("sha256").update(JSON.stringify([jobId, token, type])).digest(
        "hex",
      )
    }`;
  return executeMetadataCommand(
    uid,
    { commandId, expectedOwnerUid: uid, payload: { jobId, token } },
    type,
    (value) => value,
    async (context) => {
      const job = await context.readSystemJob(jobId);
      if (!job) {
        throw new HttpsError(
          "failed-precondition",
          "Reminder job unavailable.",
        );
      }
      assertRecurringLease(job, token, job.targetRevision, new Date());
      context.beforeCommit(() =>
        assertRecurringLease(job, token, job.targetRevision, new Date())
      );
      return work(context, job);
    },
    db,
  );
}
export async function reconcileReminders(
  jobId: string,
  token: string,
  db: CommandDatabase,
) {
  return command(
    jobId,
    token,
    db,
    "reconcileReminders",
    async (context, job) => {
      const periods = await db.scan(context.uid, "obligationInstances");
      const after = typeof job.cursor === "string" ? job.cursor : null;
      const batch = periods.filter((period) =>
        after === null || period.instanceId > after
      ).slice(0, 100);
      for (const period of batch) {
        const id = periodJobId(
            context.uid,
            period.instanceId,
            "reminderPreparation",
          ),
          old = await context.readSystemJob(id);
        context.systemJob(id, {
          kind: "reminderPreparation",
          subjectId: period.instanceId,
          obligationId: period.obligationId,
          targetRevision: period.revision,
          status: "pending",
          nextRunAt: Instant.fromMillis(Date.now()),
          generation: (old?.generation ?? 0) + 1,
          ...cleared,
        }, old !== null);
      }
      const more = batch.length === 100;
      context.systemJob(jobId, {
        status: more ? "pending" : "complete",
        nextRunAt: more ? Instant.fromMillis(Date.now()) : null,
        cursor: more ? batch.at(-1)!.instanceId : null,
        generation: job.generation + 1,
        ...cleared,
      }, true);
      return { prepared: batch.length };
    },
  );
}
export async function prepareReminders(
  jobId: string,
  token: string,
  db: CommandDatabase,
) {
  return command(jobId, token, db, "prepareReminders", async (context, job) => {
    const details = await readReminderContext(context, job.subjectId),
      now = new Date();
    if (job.obligationId !== details.parent.obligationId) {
      throw new HttpsError(
        "failed-precondition",
        "Reminder parent unavailable.",
      );
    }
    const entries = await db.scan(context.uid, "reminders");
    const obsolete = entries.filter((entry) =>
      entry.instanceId === job.subjectId && !entry.visible &&
      ["pending", "failed"].includes(entry.status) &&
      entry.contextKey !== details.contextKey
    ).slice(0, 100);
    for (const entry of obsolete) {
      context.update("reminders", entry.reminderId, {
        status: "cancelled",
        visible: false,
        visibleAt: null,
        revision: entry.revision + 1,
      });
      const id = deliveryId(context.uid, entry.reminderId),
        old = await context.readSystemJob(id);
      if (old) {
        context.systemJob(id, {
          status: "cancelled",
          nextRunAt: null,
          generation: old.generation + 1,
          ...cleared,
        }, true);
      }
    }
    const hasMore = obsolete.length === 100;
    const plans = hasMore ? [] : planReminders(
      details.subject,
      details.preferences,
      context.profile.timezone,
      now,
    );
    if (plans.length > 32) {
      throw new HttpsError(
        "failed-precondition",
        "Reminder schedule unavailable.",
      );
    }
    let created = 0;
    for (const plan of plans) {
      const id = reminderId(
        context.uid,
        job.subjectId,
        plan.kind,
        plan.civilTargetDate,
        details.preferenceRevision,
        details.policyRevision,
      );
      const previous = await context.maybeRead("reminders", id),
        jobKey = deliveryId(context.uid, id),
        oldJob = await context.readSystemJob(jobKey);
      if (previous?.visible === true) continue;
      if (
        previous?.contextKey === details.contextKey &&
        previous.status === "pending" &&
        previous.scheduledAt instanceof Instant &&
        previous.scheduledAt.toMillis() === plan.scheduledAt.getTime() &&
        oldJob && ["pending", "leased"].includes(oldJob.status)
      ) continue;
      const data = {
        reminderId: id,
        obligationId: details.parent.obligationId,
        instanceId: job.subjectId,
        kind: plan.kind,
        phase: plan.phase,
        civilTargetDate: plan.civilTargetDate,
        scheduledAt: Instant.fromDate(plan.scheduledAt),
        savedTimezone: details.subject.timezone,
        quietTimezone: context.profile.timezone,
        preferenceRevision: details.preferenceRevision,
        policyRevision: details.policyRevision,
        parentRevision: details.parent.revision,
        instanceRevision: details.instance.revision,
        contextKey: details.contextKey,
        status: "pending",
        visible: false,
        visibleAt: null,
        readAt: null,
        revision: (previous?.revision ?? 0) + 1,
        title: details.title,
        amountMinor: details.subject.remainingMinor,
        currency: details.currency,
        messageKey: `reminder.${plan.kind}`,
        externalExpiresAt: Instant.fromMillis(
          plan.scheduledAt.getTime() + 86400000,
        ),
        deliverySummary: {},
      };
      if (previous) context.update("reminders", id, data);
      else {
        context.create("reminders", id, data);
        created++;
      }
      context.systemJob(jobKey, {
        kind: "reminderDelivery",
        subjectId: id,
        obligationId: details.parent.obligationId,
        instanceId: job.subjectId,
        targetContextKey: details.contextKey,
        status: "pending",
        nextRunAt: Instant.fromDate(plan.scheduledAt),
        generation: (oldJob?.generation ?? 0) + 1,
        ...cleared,
      }, oldJob !== null);
    }
    const extend = !details.subject.closed &&
      details.subject.dueDate !== null && details.preferences.enabled &&
      details.subject.reminderPolicy?.enabled !== false;
    const next = hasMore
      ? now
      : extend
      ? nextCivilBoundary(details.subject.timezone, now)
      : null;
    context.systemJob(jobId, {
      status: next ? "pending" : "complete",
      nextRunAt: next ? Instant.fromDate(next) : null,
      generation: job.generation + 1,
      preparedContextKey: details.contextKey,
      ...cleared,
    }, true);
    return { created };
  });
}
export async function deliverReminder(
  jobId: string,
  token: string,
  db: CommandDatabase,
) {
  return command(jobId, token, db, "deliverReminder", async (context, job) => {
    const entry = await context.read("reminders", job.subjectId),
      details = await readReminderContext(context, job.instanceId);
    if (
      entry.contextKey !== details.contextKey || entry.status === "cancelled" ||
      details.subject.closed || !details.preferences.enabled
    ) {
      if (!entry.visible) {
        context.update("reminders", entry.reminderId, {
          status: "cancelled",
          revision: entry.revision + 1,
        });
      }
      context.systemJob(jobId, {
        status: "cancelled",
        nextRunAt: null,
        generation: job.generation + 1,
        ...cleared,
      }, true);
      return { visible: false };
    }
    if (
      !(entry.scheduledAt instanceof Instant) ||
      entry.scheduledAt.toMillis() > Date.now()
    ) throw new HttpsError("aborted", "Reminder is not due.");
    if (!entry.visible) {
      context.update("reminders", entry.reminderId, {
        visible: true,
        visibleAt: Audit.serverTimestamp(),
        status: "sent",
        revision: entry.revision + 1,
        deliverySummary: {
          inApp: "published",
          push: details.preferences.pushEnabled ? "pending" : "disabled",
        },
      });
      context.activity("reminderGenerated", {
        obligationId: entry.obligationId,
        instanceId: entry.instanceId,
        title: entry.title,
        amountMinor: entry.amountMinor,
        currency: entry.currency,
      });
    }
    if (details.preferences.pushEnabled) {
      const pushId = pushJobId(context.uid, entry.reminderId),
        previous = await context.readSystemJob(pushId);
      if (!previous) {
        context.systemJob(pushId, {
          kind: "reminderPush",
          subjectId: entry.reminderId,
          instanceId: entry.instanceId,
          obligationId: entry.obligationId,
          targetRevision: entry.revision,
          targetContextKey: entry.contextKey,
          status: "pending",
          nextRunAt: Instant.fromMillis(Date.now()),
          generation: 1,
          ...cleared,
        }, false);
      }
    }
    // External delivery is a separate retryable job; publishing the private inbox
    // must not depend on a third-party messaging outage.
    context.systemJob(jobId, {
      status: "complete",
      nextRunAt: null,
      generation: job.generation + 1,
      ...cleared,
    }, true);
    return {
      visible: true,
      reminderId: entry.reminderId,
      pushRequested: details.preferences.pushEnabled,
    };
  });
}
