import { createHash } from "node:crypto";
import {
  Audit,
  type CommandDatabase,
  Instant,
  type RecordData,
} from "../shared/runtime.ts";
import { HttpsError } from "../shared/errors.ts";
import { exactObject } from "../shared/callable.ts";
import {
  executeOwnerCommand,
  type OwnerCommandContext,
} from "../shared/commands.ts";
import {
  identifier,
  localToday,
  revision,
  textValue,
} from "../shared/validation.ts";
import { assertRecurringLease, periodJobId } from "../jobs/recurring_jobs.ts";
import {
  paymentDocument,
  paymentSourceSnapshot,
  validatePaymentTerms,
} from "../payments/payment_service.ts";
import { calculateBalance } from "../payments/calculation.ts";
import {
  applyRecurringBalance,
  readRecurringPeriod,
  savedAutomaticTerms,
  validateRecurringPaymentDate,
} from "./recurring_balance.ts";
import {
  automaticDecision,
  deductionEventId,
  scheduledEventKey,
  stageAttempt,
} from "./deduction_events.ts";
import { stagePeriodJobs } from "./instance_service.ts";

export async function processAutomatic(
  jobId: string,
  token: string,
  db: CommandDatabase,
  injectedNow?: Date,
) {
  identifier(jobId);
  identifier(token);
  const initial = await db.readJob(jobId);
  if (!initial) {
    throw new HttpsError(
      "failed-precondition",
      "The deduction job is unavailable.",
    );
  }
  const uid = identifier(initial.userId),
    instanceId = identifier(initial.subjectId),
    obligationId = identifier(initial.obligationId);
  if (jobId !== periodJobId(uid, instanceId, "automaticDeduction")) {
    throw new HttpsError("failed-precondition", "Invalid deduction job.");
  }
  const eventKey = textValue(initial.eventKey, 120, true),
    commandId = `automatic-${
      createHash("sha256").update(JSON.stringify([uid, instanceId, eventKey]))
        .digest("hex")
    }`;
  // A permanent event receipt is independent of the worker's transient lease.
  return executeOwnerCommand(
    uid,
    { commandId, expectedOwnerUid: uid, payload: { jobId, eventKey } },
    "processAutomatic",
    (input) => {
      const raw = exactObject(input, ["jobId", "eventKey"]);
      return {
        jobId: identifier(raw.jobId),
        eventKey: textValue(raw.eventKey, 120, true),
      };
    },
    async (context) => {
      const job = await context.readSystemJob(jobId),
        { parent, instance } = await readRecurringPeriod(
          context,
          obligationId,
          instanceId,
        );
      if (
        !job || job.kind !== "automaticDeduction" ||
        job.subjectId !== instanceId || job.obligationId !== obligationId ||
        job.eventKey !== eventKey || eventKey !== scheduledEventKey(instance) ||
        !(instance.deductionAt instanceof Instant) ||
        !(instance.createdAt instanceof Instant)
      ) {
        throw new HttpsError(
          "failed-precondition",
          "This deduction needs recovery.",
        );
      }
      const clock = () => injectedNow ?? new Date(), now = clock();
      assertRecurringLease(job, token, instance.revision, now);
      context.beforeCommit(() =>
        assertRecurringLease(job, token, instance.revision, clock())
      );
      const eventId = deductionEventId(instanceId, eventKey),
        existing = await context.maybeRead("deductionEvents", eventId);
      if (existing) {
        throw new HttpsError(
          "failed-precondition",
          "This scheduled event has already been processed.",
        );
      }
      const decision = automaticDecision({
        paymentMode: instance.paymentMode,
        amountMinor: instance.amountMinor,
        remainingMinor: instance.remainingMinor,
        closed: instance.closed,
        deductionStatus: instance.deductionStatus,
        requiresConfirmation: instance.requiresDeductionConfirmation,
        scheduledAt: instance.deductionAt.toDate(),
        createdAt: instance.createdAt.toDate(),
        now,
      });
      if (decision === "defer") {
        throw new HttpsError(
          "failed-precondition",
          "This deduction is not due yet.",
        );
      }
      const paymentId = decision === "assume" ? context.id("payment") : null,
        attemptId = stageAttempt(
          context,
          instance,
          decision === "assume"
            ? "assumed"
            : decision === "expect"
            ? "expected"
            : "suppressed",
          paymentId,
          null,
          now,
        );
      let instanceRevision = instance.revision + 1;
      if (paymentId) {
        const terms = savedAutomaticTerms(instance, instance.remainingMinor),
          allocations = [{ instanceId, amountMinor: terms.amountMinor }];
        const applied = await applyRecurringBalance(
          context,
          parent,
          instance,
          instance.amountMinor,
          { deductionStatus: "deducted", lastDeductionAttemptId: attemptId },
          now,
        );
        instanceRevision = applied.instanceRevision;
        const document = paymentDocument(
          context,
          paymentId,
          {
            ...parent,
            contactId: instance.contactId,
            categoryId: instance.categoryId,
          },
          allocations,
          terms,
          instance.paymentSourceOverrideSnapshot ??
            instance.snapshot.sourceSnapshot,
        );
        context.create("payments", paymentId, {
          ...document,
          provenance: "assumedAutomatic",
          paymentTimezone: instance.timezone,
          paidAt: instance.deductionAt,
          eventKey,
        });
        context.activity("automaticPaymentRecorded", {
          obligationId,
          instanceId,
          paymentId,
          title: instance.snapshot.title,
          amountMinor: terms.amountMinor,
          currency: instance.currency,
          direction: "owedByMe",
        });
      } else {
        const changes = {
          lastDeductionAttemptId: attemptId,
          revision: instanceRevision,
          ...(decision === "expect"
            ? {
              deductionStatus: "expected",
              requiresDeductionConfirmation: true,
            }
            : {}),
        };
        await stagePeriodJobs(context, instance, changes, now);
        context.update("obligationInstances", instanceId, changes);
        if (decision === "expect") {
          context.activity("automaticPaymentExpected", {
            obligationId,
            instanceId,
            title: instance.snapshot.title,
            amountMinor: instance.remainingMinor,
            currency: instance.remainingMinor === null
              ? null
              : instance.currency,
          });
        }
      }
      context.create("deductionEvents", eventId, {
        eventId,
        eventKey,
        obligationId,
        instanceId,
        attemptId,
        paymentId,
        decision,
        consumedAt: Audit.serverTimestamp(),
      });
      context.systemJob(jobId, {
        status: "complete",
        nextRunAt: null,
        targetRevision: instanceRevision,
        generation: job.generation + 1,
        leaseToken: null,
        leaseGeneration: null,
        leaseExpiresAt: null,
        lastError: null,
      }, true);
      return {
        obligationId,
        instanceId,
        instanceRevision,
        attemptId,
        paymentId,
        decision,
      };
    },
    db,
  );
}
async function scheduledEvent(
  context: OwnerCommandContext,
  instance: RecordData,
) {
  const event = await context.read(
    "deductionEvents",
    deductionEventId(instance.instanceId, scheduledEventKey(instance)),
  );
  if (
    event.instanceId !== instance.instanceId ||
    event.obligationId !== instance.obligationId ||
    event.eventKey !== scheduledEventKey(instance)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "This deduction needs recovery.",
    );
  }
  return event;
}
export async function confirmDeduction(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  return executeOwnerCommand(uid, input, "confirmDeduction", (input) => {
    const raw = exactObject(input, [
      "obligationId",
      "instanceId",
      "expectedRevision",
      "amountMinor",
      "paymentDate",
      "paymentSourceId",
      "paymentMethod",
      "notes",
    ]);
    const { obligationId, instanceId, expectedRevision, ...terms } = raw;
    return {
      obligationId: identifier(obligationId),
      instanceId: identifier(instanceId),
      expectedRevision: revision(expectedRevision),
      ...validatePaymentTerms(terms),
    };
  }, async (context, payload) => {
    const { parent, instance } = await readRecurringPeriod(
      context,
      payload.obligationId,
      payload.instanceId,
    );
    if (instance.revision !== payload.expectedRevision) {
      throw new HttpsError(
        "aborted",
        "This deduction changed. Refresh and try again.",
      );
    }
    if (
      !["expected", "deducted"].includes(instance.deductionStatus) ||
      instance.amountMinor === null
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Enter a known bill amount and review an expected deduction.",
      );
    }
    const event = await scheduledEvent(context, instance);
    validateRecurringPaymentDate(context, payload.paymentDate, instance);
    let paymentId: string,
      evidenceId: string | null = null,
      applied: { obligationRevision: number; instanceRevision: number };
    if (instance.deductionStatus === "deducted") {
      const original = await context.read(
          "payments",
          identifier(event.paymentId),
        ),
        marker = await context.maybeRead(
          "paymentReversals",
          original.paymentId,
        );
      if (
        original.provenance !== "assumedAutomatic" ||
        original.obligationInstanceId !== instance.instanceId || marker
      ) {
        throw new HttpsError(
          "failed-precondition",
          "This payment was corrected. Review its history.",
        );
      }
      if (
        payload.amountMinor !== original.amountMinor ||
        payload.paymentDate !== original.paymentDate ||
        payload.paymentSourceId !== original.paymentSourceId
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Correct the payment to change its amount, date or source.",
        );
      }
      paymentId = original.paymentId;
      evidenceId = context.id("evidence");
      context.create("paymentEvidence", evidenceId, {
        evidenceId,
        paymentId,
        obligationId: parent.obligationId,
        instanceId: instance.instanceId,
        kind: "userConfirmed",
        actor: "user",
        notes: payload.notes,
        recordedAt: Audit.serverTimestamp(),
      });
      const attemptId = stageAttempt(
        context,
        instance,
        "confirmed",
        paymentId,
        null,
        new Date(),
        payload.amountMinor,
      );
      applied = await applyRecurringBalance(
        context,
        parent,
        instance,
        instance.totalPaidMinor,
        { deductionStatus: "confirmed", lastDeductionAttemptId: attemptId },
      );
    } else {
      if (instance.closed) {
        throw new HttpsError(
          "failed-precondition",
          "This billing period is closed.",
        );
      }
      const snapshot = await paymentSourceSnapshot(
          context,
          payload.paymentSourceId,
        ),
        balance = calculateBalance(
          instance.amountMinor,
          instance.totalPaidMinor,
          payload.amountMinor,
        );
      paymentId = context.id("payment");
      const attemptId = stageAttempt(
        context,
        instance,
        "confirmed",
        paymentId,
        null,
        new Date(),
        payload.amountMinor,
      );
      applied = await applyRecurringBalance(
        context,
        parent,
        instance,
        balance.totalPaidMinor,
        { deductionStatus: "confirmed", lastDeductionAttemptId: attemptId },
      );
      const terms = paymentDocument(
        context,
        paymentId,
        {
          ...parent,
          contactId: instance.contactId,
          categoryId: instance.categoryId,
        },
        [{ instanceId: instance.instanceId, amountMinor: payload.amountMinor }],
        payload,
        snapshot,
      );
      context.create("payments", paymentId, {
        ...terms,
        provenance: "confirmedAutomatic",
        eventKey: scheduledEventKey(instance),
      });
    }
    context.activity("automaticPaymentConfirmed", {
      obligationId: parent.obligationId,
      instanceId: instance.instanceId,
      paymentId,
      title: instance.snapshot.title,
      amountMinor: payload.amountMinor,
      currency: instance.currency,
    });
    return {
      paymentId,
      evidenceId,
      obligationId: parent.obligationId as string,
      instanceId: instance.instanceId as string,
      ...applied,
    };
  }, db);
}
export async function reportDeductionFailure(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  return executeOwnerCommand(uid, input, "reportDeductionFailure", (input) => {
    const raw = exactObject(input, [
      "obligationId",
      "instanceId",
      "expectedRevision",
      "reason",
    ]);
    return {
      obligationId: identifier(raw.obligationId),
      instanceId: identifier(raw.instanceId),
      expectedRevision: revision(raw.expectedRevision),
      reason: textValue(raw.reason, 1000, true),
    };
  }, async (context, payload) => {
    const { parent, instance } = await readRecurringPeriod(
      context,
      payload.obligationId,
      payload.instanceId,
    );
    if (instance.revision !== payload.expectedRevision) {
      throw new HttpsError(
        "aborted",
        "This deduction changed. Refresh and try again.",
      );
    }
    if (
      !["expected", "deducted", "confirmed"].includes(instance.deductionStatus)
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Review an expected or recorded deduction first.",
      );
    }
    const event = await scheduledEvent(context, instance);
    // The scheduled event stays immutable. Corrections and reconfirmations
    // append attempts, so its original payment is not necessarily current.
    const latest = await context.read(
      "deductionAttempts",
      identifier(instance.lastDeductionAttemptId),
    );
    const allowed = instance.deductionStatus === "expected"
      ? ["expected", "corrected"]
      : instance.deductionStatus === "deducted"
      ? ["assumed"]
      : ["confirmed"];
    if (
      latest.attemptId !== instance.lastDeductionAttemptId ||
      latest.instanceId !== instance.instanceId ||
      latest.obligationId !== instance.obligationId ||
      latest.eventKey !== event.eventKey || !allowed.includes(latest.eventType)
    ) {
      throw new HttpsError(
        "failed-precondition",
        "This deduction needs recovery.",
      );
    }
    const relatedPaymentId = instance.deductionStatus === "expected"
      ? null
      : identifier(latest.paymentId);
    let reversalId: string | null = null,
      paid = instance.totalPaidMinor,
      attemptAmount = instance.remainingMinor;
    if (relatedPaymentId !== null) {
      const original = await context.read(
          "payments",
          identifier(relatedPaymentId),
        ),
        marker = await context.maybeRead(
          "paymentReversals",
          original.paymentId,
        );
      if (
        !["assumedAutomatic", "confirmedAutomatic"].includes(
          original.provenance,
        ) || original.eventKey !== event.eventKey ||
        original.obligationId !== instance.obligationId ||
        original.obligationInstanceId !== instance.instanceId ||
        original.currency !== instance.currency ||
        original.amountMinor !== latest.expectedAmountMinor ||
        original.entryType !== "payment" || marker
      ) {
        throw new HttpsError(
          "failed-precondition",
          "This deduction needs recovery.",
        );
      }
      attemptAmount = original.amountMinor;
      if (!marker) {
        if (paid < original.amountMinor) {
          throw new HttpsError(
            "failed-precondition",
            "This payment history needs recovery.",
          );
        }
        paid -= original.amountMinor;
        reversalId = context.id("reversal");
        const correctionGroupId = context.id("correction");
        context.create("payments", reversalId, {
          ...original,
          paymentId: reversalId,
          entryType: "reversal",
          commandId: context.commandId,
          reversesPaymentId: original.paymentId,
          correctionGroupId,
          correctionReason: payload.reason,
          eventKey: null,
          recordedAt: Audit.serverTimestamp(),
        });
        context.create("paymentReversals", original.paymentId, {
          originalPaymentId: original.paymentId,
          reversalId,
          correctionGroupId,
          recordedAt: Audit.serverTimestamp(),
        });
      }
    }
    const attemptId = stageAttempt(
      context,
      instance,
      "failed",
      relatedPaymentId,
      payload.reason,
      new Date(),
      attemptAmount,
    );
    let applied;
    if (instance.amountMinor !== null) {
      applied = await applyRecurringBalance(context, parent, instance, paid, {
        deductionStatus: "failed",
        requiresDeductionConfirmation: true,
        lastDeductionAttemptId: attemptId,
      });
    } else {
      const changes = {
        deductionStatus: "failed",
        requiresDeductionConfirmation: true,
        lastDeductionAttemptId: attemptId,
        revision: revision(instance.revision) + 1,
      };
      await stagePeriodJobs(context, instance, changes, new Date());
      context.update("obligationInstances", instance.instanceId, changes);
      applied = {
        instanceRevision: changes.revision,
        obligationRevision: parent.revision,
      };
    }
    context.activity("automaticPaymentFailed", {
      obligationId: parent.obligationId,
      instanceId: instance.instanceId,
      reversalId,
      title: instance.snapshot.title,
      amountMinor: attemptAmount,
      currency: attemptAmount === null ? null : instance.currency,
      reason: payload.reason,
    });
    return {
      obligationId: parent.obligationId as string,
      instanceId: instance.instanceId as string,
      reversalId,
      attemptId,
      ...applied,
    };
  }, db);
}
