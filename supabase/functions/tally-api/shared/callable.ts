import { HttpsError } from "./errors.ts";

export function exactObject(
  input: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpsError("invalid-argument", "Invalid request.");
  }
  const object = input as Record<string, unknown>;
  if (
    Object.keys(object).some((key) => !fields.includes(key)) ||
    fields.some((key) => !(key in object))
  ) {
    throw new HttpsError("invalid-argument", "Invalid request fields.");
  }
  return object;
}
