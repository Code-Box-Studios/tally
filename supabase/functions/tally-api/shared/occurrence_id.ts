import { createHash } from "node:crypto";
import { civilDate, identifier, invalid } from "./validation.ts";

export function occurrenceInstanceId(
  obligationId: string,
  key: string,
): string {
  identifier(obligationId);
  if (typeof key !== "string") return invalid("Invalid billing period.");
  if (/^i:\d{4}$/.test(key)) {
    const index = Number(key.slice(2));
    if (index < 1 || index > 120) return invalid("Invalid installment period.");
  } else if (key.startsWith("r:")) civilDate(key.slice(2));
  else return invalid("Invalid billing period.");
  return `instance-${
    createHash("sha256").update(JSON.stringify([obligationId, key])).digest(
      "hex",
    )
  }`;
}
