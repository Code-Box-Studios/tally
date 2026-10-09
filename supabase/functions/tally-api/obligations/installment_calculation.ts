import { exactObject } from "../shared/callable.ts";
import { civilDate, invalid, moneyMinor } from "../shared/validation.ts";

export interface InstallmentTerm {
  amountMinor: number;
  dueDate: string;
}

function installmentCount(value: unknown): number {
  if (
    typeof value !== "number" || !Number.isInteger(value) || value < 2 ||
    value > 120
  ) {
    return invalid("Choose between 2 and 120 installments.");
  }
  return value;
}

export function equalInstallments(principal: number, count: number): number[] {
  moneyMinor(principal);
  installmentCount(count);
  const base = Number(BigInt(principal) / BigInt(count));
  if (base === 0) {
    return invalid("The amount is too small for that many installments.");
  }
  return Array.from(
    { length: count },
    (_, index) => index === count - 1 ? principal - base * (count - 1) : base,
  );
}

export function validateSchedule(
  input: unknown,
  principal: number,
  origination: string,
): InstallmentTerm[] {
  moneyMinor(principal);
  civilDate(origination);
  if (!Array.isArray(input)) return invalid("Enter an installment schedule.");
  installmentCount(input.length);
  let previous = origination;
  let total = 0;
  const terms = input.map((value) => {
    const raw = exactObject(value, ["amountMinor", "dueDate"]);
    const amountMinor = moneyMinor(raw.amountMinor);
    const dueDate = civilDate(raw.dueDate);
    if (dueDate < previous) {
      return invalid(
        "Installments must follow the borrowed or lent date and be in due date order.",
      );
    }
    previous = dueDate;
    total += amountMinor;
    return { amountMinor, dueDate };
  });
  if (total !== principal) {
    return invalid("Installment amounts must add up to the original amount.");
  }
  return terms;
}
