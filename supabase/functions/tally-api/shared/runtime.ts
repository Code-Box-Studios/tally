export type { CommandDatabase } from "./database.ts";
// The legacy versioned DTO boundary is validated by each feature before use.
// Financial calculations keep integer minor units, never floating-point totals.
// deno-lint-ignore no-explicit-any
export type RecordData = Record<string, any>;

export class Instant {
  private constructor(private readonly milliseconds: number) {
    if (!Number.isFinite(milliseconds)) throw new Error("Invalid instant");
  }
  static fromDate(date: Date): Instant {
    return new Instant(date.getTime());
  }
  static fromMillis(value: number): Instant {
    return new Instant(value);
  }
  toDate(): Date {
    return new Date(this.milliseconds);
  }
  toMillis(): number {
    return this.milliseconds;
  }
  toJSON(): string {
    return this.toDate().toISOString();
  }
}

export const Audit = { serverTimestamp: () => ({ $tallyAudit: "server" }) };

/** Decode instants only at known audit/scheduling keys; civil dates stay strings. */
export function persisted(value: unknown, key = ""): unknown {
  if (
    typeof value === "string" && /(?:At|Until)$/.test(key) &&
    /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    return Instant.fromDate(new Date(value));
  }
  if (Array.isArray(value)) return value.map((item) => persisted(item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map((
        [name, item],
      ) => [name, persisted(item, name)]),
    );
  }
  return value;
}
