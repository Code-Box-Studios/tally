import { Audit, type RecordData } from "../shared/runtime.ts";
import { HttpsError } from "../shared/errors.ts";
import type { OwnerCommandContext } from "../shared/commands.ts";
import {
  civilDate,
  invalid,
  localToday,
  revision,
} from "../shared/validation.ts";
import { statusForBalance } from "../shared/financial_status.ts";
import { calculateBalance } from "../payments/calculation.ts";
import {
  paymentDocument,
  type PaymentInput,
  paymentSourceSnapshot,
  type PaymentTerms,
} from "../payments/payment_service.ts";
import { readRecurringInstance, stagePeriodJobs } from "./instance_service.ts";
import { stageRecurringJob } from "../jobs/recurring_jobs.ts";
import { stageAttempt } from "./deduction_events.ts";

export async function readRecurringPeriod(
  context: OwnerCommandContext,
  parentId: string,
  instanceId: string,
) {
  const period = await readRecurringInstance(context, parentId, instanceId),
    instance = period.instance;
  localToday(instance.timezone);
  revision(instance.revision);
  civilDate(instance.occurrenceDate);
  if (
    !["manual", "automatic", "automaticConfirmation"].includes(
      instance.paymentMode,
    ) ||
    ![
      "scheduled",
      "expected",
      "deducted",
      "confirmed",
      "failed",
      "resolved",
      null,
    ].includes(instance.deductionStatus) ||
    (!["skipped", "cancelled"].includes(instance.financialStatus) &&
      instance.closed !== (instance.remainingMinor === 0))
  ) throw new HttpsError("failed-precondition", "This period needs recovery.");
  return period;
}
export function validateRecurringPaymentDate(
  context: OwnerCommandContext,
  date: string,
  instance: RecordData,
): void {
  if (
    date < instance.occurrenceDate ||
    date > localToday(context.profile.timezone)
  ) {
    return invalid(
      "Choose a payment date from this billing period’s start through today.",
    );
  }
}
export async function applyRecurringBalance(
  context: OwnerCommandContext,
  parent: RecordData,
  instance: RecordData,
  totalPaidMinor: number,
  extras: RecordData = {},
  now = new Date(),
) {
  if (instance.amountMinor === null) {
    throw new HttpsError(
      "failed-precondition",
      "Enter this bill’s amount first.",
    );
  }
  const balance = calculateBalance(instance.amountMinor, totalPaidMinor, 0),
    instanceRevision = revision(instance.revision) + 1,
    obligationRevision = revision(parent.revision) + 1;
  const changes = {
    ...balance,
    closed: balance.remainingMinor === 0,
    hasPaymentHistory: true,
    financialStatus: statusForBalance(
      balance.totalPaidMinor,
      balance.remainingMinor,
      instance.dueDate,
      localToday(instance.timezone, now),
    ),
    ...extras,
    revision: instanceRevision,
  };
  await stagePeriodJobs(context, instance, changes, now);
  context.update("obligationInstances", instance.instanceId, changes);
  await stageRecurringJob(
    context,
    parent.obligationId,
    obligationRevision,
    now,
  );
  context.update("obligations", parent.obligationId, {
    hasPaymentHistory: true,
    revision: obligationRevision,
  });
  return {
    obligationRevision,
    instanceRevision,
    allocationRevisions: [{
      instanceId: instance.instanceId,
      instanceRevision,
    }],
    remainingMinor: balance.remainingMinor,
  };
}
export async function recordRecurringPayment(
  context: OwnerCommandContext,
  payload: PaymentInput,
) {
  const { parent, instance } = await readRecurringPeriod(
    context,
    payload.obligationId,
    payload.obligationInstanceId,
  );
  if (instance.closed || instance.amountMinor === null) {
    throw new HttpsError(
      "failed-precondition",
      instance.amountMinor === null
        ? "Enter this bill’s amount first."
        : "This billing period is closed.",
    );
  }
  if (payload.currency !== instance.currency) {
    return invalid("Payment currency must match the bill.");
  }
  validateRecurringPaymentDate(context, payload.paymentDate, instance);
  const snapshot = await paymentSourceSnapshot(
      context,
      payload.paymentSourceId,
    ),
    balance = calculateBalance(
      instance.amountMinor,
      instance.totalPaidMinor,
      payload.amountMinor,
    );
  const paymentId = context.id("payment"),
    allocations = [{
      instanceId: instance.instanceId,
      amountMinor: payload.amountMinor,
    }];
  const resolved = balance.remainingMinor === 0 &&
    instance.paymentMode !== "manual" &&
    ["expected", "failed"].includes(instance.deductionStatus);
  const extras: RecordData = resolved
    ? {
      deductionStatus: "resolved",
      deductionResolution: "manual",
      lastDeductionAttemptId: stageAttempt(
        context,
        instance,
        "manualResolved",
        paymentId,
        null,
        new Date(),
        payload.amountMinor,
      ),
    }
    : {};
  const applied = await applyRecurringBalance(
    context,
    parent,
    instance,
    balance.totalPaidMinor,
    extras,
  );
  context.create(
    "payments",
    paymentId,
    paymentDocument(
      context,
      paymentId,
      {
        ...parent,
        contactId: instance.contactId,
        categoryId: instance.categoryId,
      },
      allocations,
      payload,
      snapshot,
    ),
  );
  context.activity("paymentMade", {
    obligationId: parent.obligationId,
    instanceId: instance.instanceId,
    paymentId,
    title: instance.snapshot.title,
    amountMinor: payload.amountMinor,
    currency: instance.currency,
    direction: "owedByMe",
    partial: balance.remainingMinor > 0,
  });
  return {
    paymentId,
    obligationId: parent.obligationId as string,
    obligationInstanceId: instance.instanceId as string,
    ...applied,
  };
}
export function savedAutomaticTerms(
  instance: RecordData,
  amountMinor: number,
): PaymentTerms {
  const type =
    (instance.paymentSourceOverrideSnapshot ?? instance.snapshot.sourceSnapshot)
      ?.type;
  const paymentMethod: PaymentTerms["paymentMethod"] = type === "cash"
    ? "cash"
    : type === "bankAccount"
    ? "bankTransfer"
    : ["debitCard", "creditCard"].includes(type)
    ? "card"
    : type === "eWallet"
    ? "eWallet"
    : type === "payroll"
    ? "payroll"
    : "other";
  return {
    amountMinor,
    paymentDate: instance.deductionDate,
    paymentSourceId: instance.paymentSourceId,
    paymentMethod,
    notes: "",
  };
}
export async function correctRecurringPayment(
  context: OwnerCommandContext,
  original: RecordData,
  payload: {
    paymentId: string;
    reason: string;
    replacement: PaymentTerms | null;
    expectedObligationRevision?: number;
  },
) {
  const { parent, instance } = await readRecurringPeriod(
    context,
    original.obligationId,
    original.obligationInstanceId,
  );
  if (
    payload.expectedObligationRevision !== undefined &&
    payload.expectedObligationRevision !== parent.revision
  ) {
    throw new HttpsError(
      "aborted",
      "This obligation changed. Refresh before correcting its payment.",
    );
  }
  if (
    instance.amountMinor === null ||
    ["skipped", "cancelled"].includes(instance.financialStatus) ||
    original.currency !== instance.currency ||
    original.amountMinor > instance.totalPaidMinor ||
    !Array.isArray(original.allocations) || original.allocations.length !== 1 ||
    original.allocations[0].instanceId !== instance.instanceId ||
    original.allocations[0].amountMinor !== original.amountMinor
  ) {
    throw new HttpsError(
      "failed-precondition",
      "This payment history needs recovery.",
    );
  }
  const restored = instance.totalPaidMinor - original.amountMinor;
  if (payload.replacement) {
    validateRecurringPaymentDate(
      context,
      payload.replacement.paymentDate,
      instance,
    );
  }
  const snapshot = payload.replacement
    ? await paymentSourceSnapshot(context, payload.replacement.paymentSourceId)
    : null;
  const balance = calculateBalance(
      instance.amountMinor,
      restored,
      payload.replacement?.amountMinor ?? 0,
    ),
    reversalId = context.id("reversal"),
    correctionGroupId = context.id("correction"),
    replacementId = payload.replacement ? context.id("replacement") : null;
  const extras: RecordData = {};
  if (original.provenance !== "manual") {
    extras.deductionStatus = balance.remainingMinor > 0
      ? "expected"
      : "resolved";
    extras.requiresDeductionConfirmation = true;
    extras.lastDeductionAttemptId = stageAttempt(
      context,
      instance,
      "corrected",
      original.paymentId,
      payload.reason,
      new Date(),
      original.amountMinor,
    );
  }
  const applied = await applyRecurringBalance(
    context,
    parent,
    instance,
    balance.totalPaidMinor,
    extras,
  );
  context.create("payments", reversalId, {
    ...original,
    paymentId: reversalId,
    entryType: "reversal",
    commandId: context.commandId,
    reversesPaymentId: payload.paymentId,
    correctionGroupId,
    correctionReason: payload.reason,
    eventKey: null,
    recordedAt: Audit.serverTimestamp(),
  });
  context.create("paymentReversals", payload.paymentId, {
    originalPaymentId: payload.paymentId,
    reversalId,
    correctionGroupId,
    recordedAt: Audit.serverTimestamp(),
  });
  if (payload.replacement && replacementId) {
    context.create("payments", replacementId, {
      ...paymentDocument(
        context,
        replacementId,
        {
          ...parent,
          contactId: instance.contactId,
          categoryId: instance.categoryId,
        },
        [{
          instanceId: instance.instanceId,
          amountMinor: payload.replacement.amountMinor,
        }],
        payload.replacement,
        snapshot,
      ),
      correctionGroupId,
      correctionReason: payload.reason,
    });
  }
  context.activity("paymentCorrected", {
    obligationId: parent.obligationId,
    instanceId: instance.instanceId,
    paymentId: payload.paymentId,
    reversalId,
    replacementId,
    title: instance.snapshot.title,
    amountMinor: original.amountMinor,
    currency: instance.currency,
    reason: payload.reason,
    direction: "owedByMe",
  });
  return {
    originalPaymentId: payload.paymentId,
    reversalId,
    replacementId,
    obligationId: parent.obligationId as string,
    obligationInstanceId: instance.instanceId as string,
    ...applied,
  };
}
