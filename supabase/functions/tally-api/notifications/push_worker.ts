import { createHash } from "node:crypto";
import { CommandDatabase } from "../shared/database.ts";
import { executeMetadataCommand } from "../shared/commands.ts";
import { Instant } from "../shared/runtime.ts";
import { HttpsError } from "../shared/errors.ts";
import { assertRecurringLease } from "../jobs/recurring_jobs.ts";
import { readReminderContext } from "./context.ts";
import { readNotificationDevice } from "./device_validation.ts";
import {
  pushConfigured,
  type PushOutcome,
  sendPush,
} from "./push_transport.ts";

import {
  expoPushConfigured,
  expoReceipt,
  isExpoPushToken,
  sendExpoPush,
} from "./expo_push_transport.ts";

export const pushJobId = (uid: string, id: string) =>
  `reminderPush-${
    createHash("sha256").update(JSON.stringify([uid, id])).digest("hex")
  }`;
interface PendingExpoTicket {
  id: string;
  createdAt: number;
}
const clear = { leaseToken: null, leaseGeneration: null, leaseExpiresAt: null };
/** External delivery is at least once, with per-device receipts and collapse IDs. */
export async function deliverPush(
  jobId: string,
  token: string,
  db: CommandDatabase,
) {
  const initial = await db.readJob(jobId);
  if (!initial) {
    throw new HttpsError("failed-precondition", "Push job unavailable.");
  }
  const uid = initial.userId;
  const tickets: Record<string, PendingExpoTicket> = {
    ...(initial.expoTickets ?? {}),
  };
  const contextData = async () => {
    const profile = await db.profile(uid), job = await db.readJob(jobId);
    if (!job) {
      throw new HttpsError("failed-precondition", "Push job unavailable.");
    }
    assertRecurringLease(job, token, job.targetRevision, new Date());
    // Reuse the validated reminder read boundary without staging mutations.
    const { OwnerCommandContext } = await import("../shared/commands.ts");
    const context = new OwnerCommandContext(db, uid, jobId, profile.data);
    const entry = await context.read("reminders", job.subjectId),
      details = await readReminderContext(context, job.instanceId);
    const eligible = entry.visible && entry.status === "sent" &&
      entry.contextKey === details.contextKey && details.preferences.enabled &&
      details.preferences.pushEnabled && !details.subject.closed &&
      entry.externalExpiresAt instanceof Instant &&
      entry.externalExpiresAt.toMillis() > Date.now();
    return { entry, job, eligible };
  };
  const finish = async (
    status: string,
    outcomes: Record<string, PushOutcome> = {},
  ) =>
    executeMetadataCommand(
      uid,
      {
        commandId: `push-${
          createHash("sha256").update(
            JSON.stringify([jobId, token, status, outcomes, tickets]),
          ).digest("hex")
        }`,
        expectedOwnerUid: uid,
        payload: { jobId, token, status, outcomes },
      },
      "finishPush",
      (x) => x,
      async (context) => {
        const job = await context.readSystemJob(jobId);
        if (!job) {
          throw new HttpsError(
            "failed-precondition",
            "Push job unavailable.",
          );
        }
        assertRecurringLease(job, token, job.targetRevision, new Date());
        const entry = await context.read("reminders", job.subjectId);
        context.update("reminders", entry.reminderId, {
          revision: entry.revision + 1,
          deliverySummary: { ...entry.deliverySummary, push: status },
        });
        context.systemJob(jobId, {
          status: status === "retry" ? "pending" : "complete",
          nextRunAt: status === "retry"
            ? Instant.fromMillis(Date.now() + 60000)
            : null,
          generation: job.generation + 1,
          outcomes: { ...job.outcomes, ...outcomes },
          expoTickets: tickets,
          ...clear,
        }, true);
        return { status };
      },
      db,
    );
  const start = await contextData();
  if (!start.eligible) return finish("cancelled");
  if (!pushConfigured() && !expoPushConfigured()) return finish("unconfigured");
  const devices = (await db.scan(uid, "notificationDevices", 500)).map(
    (record) => readNotificationDevice(uid, record.installationId, record),
  ).filter((device) =>
    device.active && device.channel === "push" &&
    ["granted", "provisional"].includes(device.permission) &&
    device.token !== null
  );
  const results: Record<string, PushOutcome> = {};
  let retry = false;
  for (const device of devices) {
    const key = `${device.installationId}:${device.tokenGeneration}`;
    if (start.job.outcomes?.[key] === "invalidToken") continue;
    if (start.job.outcomes?.[key] === "accepted" && !tickets[key]) continue;
    const latest = await contextData(),
      current = await db.read(
        uid,
        "notificationDevices",
        device.installationId,
      );
    if (!latest.eligible) return finish("cancelled", results);
    if (
      !current || !current.active || current.tokenHash !== device.tokenHash ||
      current.tokenGeneration !== device.tokenGeneration ||
      current.channel !== "push"
    ) continue;
    let outcome: PushOutcome;
    if (isExpoPushToken(device.token)) {
      if (!expoPushConfigured()) {
        retry = true;
        continue;
      }
      const previous = tickets[key];
      if (previous) {
        if (Date.now() - previous.createdAt < 15 * 60000) {
          retry = true;
          continue;
        }
        const receipt = await expoReceipt(previous.id).catch(() =>
          "retry" as PushOutcome
        );
        if (receipt === null || receipt === "retry") {
          if (Date.now() - previous.createdAt >= 23 * 3600000) {
            delete tickets[key];
            results[key] = "accepted";
          } else retry = true;
          continue;
        }
        outcome = receipt;
        delete tickets[key];
      } else {
        const sent: { outcome: PushOutcome; ticketId?: string } =
          await sendExpoPush(
            device.token,
            latest.entry.reminderId,
            latest.entry.obligationId,
            latest.entry.instanceId,
            latest.entry.externalExpiresAt.toMillis(),
          ).catch(() => ({ outcome: "retry" as PushOutcome }));
        outcome = sent.outcome;
        if (sent.ticketId) {
          tickets[key] = { id: sent.ticketId, createdAt: Date.now() };
          retry = true;
        }
      }
    } else {
      if (!pushConfigured()) {
        retry = true;
        continue;
      }
      outcome = await sendPush(
        device.token,
        latest.entry.reminderId,
        latest.entry.obligationId,
        latest.entry.instanceId,
        latest.entry.externalExpiresAt.toMillis(),
      ).catch(() => "retry" as PushOutcome);
    }
    results[key] = outcome;
    retry ||= outcome === "retry";
    if (outcome === "invalidToken") {
      await executeMetadataCommand(
        uid,
        {
          commandId: `invalid-${
            createHash("sha256").update(
              JSON.stringify([
                device.installationId,
                device.tokenGeneration,
                token,
              ]),
            ).digest("hex")
          }`,
          expectedOwnerUid: uid,
          payload: { key },
        },
        "invalidatePushToken",
        (x) => x,
        async (context) => {
          const value = await context.read(
            "notificationDevices",
            device.installationId,
          );
          if (
            value.tokenHash === device.tokenHash &&
            value.tokenGeneration === device.tokenGeneration
          ) {
            context.update("notificationDevices", device.installationId, {
              active: false,
              token: null,
              tokenHash: null,
              channel: "none",
              revision: value.revision + 1,
            });
          }
          return { invalidated: true };
        },
        db,
      );
    }
  }
  return finish(
    retry ? "retry" : devices.length ? "accepted" : "noDevices",
    results,
  );
}
