import { createHash } from "node:crypto";
import { Instant, type RecordData } from "../shared/runtime.ts";
import type { OwnerCommandContext } from "../shared/commands.ts";
import { identifier } from "../shared/validation.ts";

export interface AutomaticState {
  paymentMode: "manual" | "automatic" | "automaticConfirmation";
  amountMinor: number | null;
  remainingMinor: number | null;
  closed: boolean;
  deductionStatus: string | null;
  requiresConfirmation: boolean;
  scheduledAt: Date;
  createdAt: Date;
  now: Date;
}
export function automaticDecision(
  state: AutomaticState,
): "defer" | "suppress" | "expect" | "assume" {
  if (state.now.getTime() < state.scheduledAt.getTime()) return "defer";
  if (
    state.paymentMode === "manual" || state.closed ||
    state.remainingMinor === 0 ||
    ["deducted", "confirmed", "failed", "resolved"].includes(
      state.deductionStatus ?? "",
    )
  ) return "suppress";
  if (
    state.amountMinor === null || state.remainingMinor === null ||
    state.paymentMode === "automaticConfirmation" ||
    state.requiresConfirmation ||
    state.createdAt.getTime() > state.scheduledAt.getTime()
  ) return "expect";
  return "assume";
}
export function scheduledEventKey(instance: RecordData): string {
  return `automatic:${instance.occurrenceKey}:${instance.snapshot.ruleVersion}`;
}
export function deductionEventId(instanceId: string, eventKey: string): string {
  return `event-${
    createHash("sha256").update(
      JSON.stringify([identifier(instanceId), eventKey]),
    ).digest("hex")
  }`;
}
export function stageAttempt(
  context: OwnerCommandContext,
  instance: RecordData,
  eventType: string,
  paymentId: string | null,
  reason: string | null,
  now: Date,
  amountMinor: number | null = instance.remainingMinor,
): string {
  const attemptId = context.id("deductionAttempt");
  context.create("deductionAttempts", attemptId, {
    attemptId,
    obligationId: instance.obligationId,
    instanceId: instance.instanceId,
    eventKey: scheduledEventKey(instance),
    eventType,
    expectedAmountMinor: amountMinor,
    currency: instance.currency,
    paymentId,
    reason,
    sourceSnapshot: instance.paymentSourceOverrideSnapshot ??
      instance.snapshot.sourceSnapshot,
    paymentSourceId: instance.paymentSourceId,
    scheduledDate: instance.deductionDate,
    timezone: instance.timezone,
    processedAt: Instant.fromDate(now),
    actor: eventType === "assumed" || eventType === "expected" ||
        eventType === "suppressed"
      ? "system"
      : "user",
  });
  return attemptId;
}
