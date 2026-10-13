import { civilDate } from "../../core/domain/date";
import { minor } from "../../core/domain/money";
import { object, text, type Row } from "../../core/domain/records";

/** Previews the server's restore-then-reallocate policy from a complete confirmed schedule. */
export function previewInstallmentCorrection(
  obligation: Row,
  payment: Row,
  instances: Row[],
  replacementMinor: number | null,
) {
  const invalid = (): never => {
    throw new Error(
      "Refresh the complete installment schedule before correcting this payment.",
    );
  };
  const ids = obligation.data.installmentInstanceIds;
  if (
    !Array.isArray(ids) ||
    ids.length < 2 ||
    ids.length > 120 ||
    new Set(ids).size !== ids.length
  )
    return invalid();
  const owned = instances.filter(
    (row) => row.data.obligationId === obligation.id,
  );
  if (
    owned.length !== ids.length ||
    owned.some((row) => !ids.includes(row.id)) ||
    new Set(owned.map((row) => row.id)).size !== ids.length
  )
    return invalid();
  const periods = owned
    .map((row) => {
      if (row.data.currency !== obligation.data.currency) return invalid();
      const originalMinor = minor(row.data.amountMinor);
      const paidBeforeMinor = minor(row.data.totalPaidMinor, true);
      const remainingBeforeMinor = minor(row.data.remainingMinor, true);
      if (
        paidBeforeMinor + remainingBeforeMinor !== originalMinor ||
        row.data.closed !== (remainingBeforeMinor === 0)
      )
        return invalid();
      const due = text(row.data, "dueDate");
      return {
        id: row.id,
        title: text(row.data, "periodLabel", "Installment"),
        dueDate: due ? civilDate(due) : "",
        originalMinor,
        paidBeforeMinor,
        remainingBeforeMinor,
        paidAfterMinor: paidBeforeMinor,
        remainingAfterMinor: remainingBeforeMinor,
      };
    })
    .sort(
      (a, b) =>
        (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31") ||
        a.id.localeCompare(b.id),
    );
  const sum = (
    field: "originalMinor" | "paidBeforeMinor" | "remainingBeforeMinor",
  ) => periods.reduce((total, period) => total + period[field], 0);
  if (
    sum("originalMinor") !== minor(obligation.data.originalAmountMinor) ||
    sum("paidBeforeMinor") !== minor(obligation.data.totalPaidMinor, true) ||
    sum("remainingBeforeMinor") !== minor(obligation.data.remainingMinor, true)
  )
    return invalid();
  const originalAmount = minor(payment.data.amountMinor);
  if (
    payment.data.obligationId !== obligation.id ||
    payment.data.currency !== obligation.data.currency ||
    payment.data.entryType !== "payment"
  )
    return invalid();
  const rawAllocations = payment.data.allocations;
  if (
    !Array.isArray(rawAllocations) ||
    rawAllocations.length < 1 ||
    rawAllocations.length > 24
  )
    return invalid();
  const allocations = rawAllocations.map((raw) => {
    const item = object(raw);
    return {
      instanceId: text(item, "instanceId"),
      amountMinor: minor(item.amountMinor),
    };
  });
  if (
    new Set(allocations.map((a) => a.instanceId)).size !== allocations.length ||
    allocations.reduce((total, a) => total + a.amountMinor, 0) !==
      originalAmount
  )
    return invalid();
  for (const allocation of allocations) {
    const period = periods.find((p) => p.id === allocation.instanceId);
    if (!period || allocation.amountMinor > period.paidBeforeMinor)
      return invalid();
    period.paidAfterMinor -= allocation.amountMinor;
    period.remainingAfterMinor += allocation.amountMinor;
  }
  const policy =
    replacementMinor === null
      ? "reverse"
      : replacementMinor === originalAmount
        ? "preserve"
        : "oldestFirst";
  if (replacementMinor !== null) {
    minor(replacementMinor);
    if (
      replacementMinor >
      periods.reduce((total, p) => total + p.remainingAfterMinor, 0)
    )
      throw new Error(
        "The replacement exceeds the remaining balance after reversal.",
      );
    if (policy === "preserve") {
      for (const allocation of allocations) {
        const period = periods.find((p) => p.id === allocation.instanceId)!;
        period.paidAfterMinor += allocation.amountMinor;
        period.remainingAfterMinor -= allocation.amountMinor;
      }
    } else {
      let remaining = replacementMinor,
        touched = 0;
      for (const period of periods) {
        if (!remaining) break;
        if (!period.remainingAfterMinor) continue;
        if (++touched > 24)
          throw new Error(
            "This replacement covers more than 24 periods. Record smaller payments instead.",
          );
        const applied = Math.min(remaining, period.remainingAfterMinor);
        period.paidAfterMinor += applied;
        period.remainingAfterMinor -= applied;
        remaining -= applied;
      }
    }
  }
  return {
    policy,
    periods,
    remainingBeforeMinor: sum("remainingBeforeMinor"),
    remainingAfterMinor: periods.reduce(
      (total, p) => total + p.remainingAfterMinor,
      0,
    ),
  };
}
