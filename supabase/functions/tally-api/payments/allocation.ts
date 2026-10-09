import { HttpsError } from "../shared/errors.ts";
import { exactObject } from "../shared/callable.ts";
import { identifier, invalid, moneyMinor } from "../shared/validation.ts";

export interface Allocation {
  instanceId: string;
  amountMinor: number;
}
export interface AllocationInstance {
  instanceId: string;
  dueDate: string | null;
  remainingMinor: number;
  closed: boolean;
}
export const maxPaymentAllocations = 24;

export function validateAllocations(input: unknown): Allocation[] {
  if (
    !Array.isArray(input) || input.length < 1 ||
    input.length > maxPaymentAllocations
  ) {
    return invalid("A payment can cover between 1 and 24 billing periods.");
  }
  const ids = new Set<string>();
  return input.map((value) => {
    const raw = exactObject(value, ["instanceId", "amountMinor"]);
    const instanceId = identifier(raw.instanceId);
    if (ids.has(instanceId)) {
      return invalid("Choose each billing period only once.");
    }
    ids.add(instanceId);
    return { instanceId, amountMinor: moneyMinor(raw.amountMinor) };
  });
}

export function allocatePayment(
  amount: number,
  instances: readonly AllocationInstance[],
  explicit?: unknown,
): Allocation[] {
  moneyMinor(amount);
  const byId = new Map(
    instances.map((instance) => [instance.instanceId, instance]),
  );
  if (byId.size !== instances.length) {
    throw new HttpsError(
      "failed-precondition",
      "This schedule needs recovery.",
    );
  }
  if (explicit !== undefined && explicit !== null) {
    const allocations = validateAllocations(explicit);
    let total = 0;
    for (const allocation of allocations) {
      const instance = byId.get(allocation.instanceId);
      if (
        !instance || instance.closed ||
        allocation.amountMinor > instance.remainingMinor
      ) {
        throw new HttpsError(
          "failed-precondition",
          "The payment exceeds an available billing period balance.",
          { reason: "invalidAllocation" },
        );
      }
      total += allocation.amountMinor;
    }
    if (total !== amount) {
      return invalid("The allocated amounts must equal the payment.");
    }
    return allocations;
  }
  const outstanding = instances.filter((instance) =>
    !instance.closed && instance.remainingMinor > 0
  )
    .sort((a, b) =>
      (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") ||
      a.instanceId.localeCompare(b.instanceId)
    );
  const available = outstanding.reduce(
    (sum, instance) => sum + instance.remainingMinor,
    0,
  );
  if (amount > available) {
    throw new HttpsError(
      "failed-precondition",
      "The payment exceeds the remaining balance.",
      { reason: "overpayment", remainingMinor: available },
    );
  }
  const allocations: Allocation[] = [];
  let remaining = amount;
  for (const instance of outstanding) {
    if (remaining === 0) break;
    if (allocations.length === maxPaymentAllocations) {
      throw new HttpsError(
        "failed-precondition",
        "This payment covers more than 24 periods. Record it in smaller payments.",
        { reason: "allocationLimit" },
      );
    }
    const amountMinor = Math.min(remaining, instance.remainingMinor);
    allocations.push({ instanceId: instance.instanceId, amountMinor });
    remaining -= amountMinor;
  }
  return allocations;
}
