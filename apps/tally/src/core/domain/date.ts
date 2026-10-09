export function civilDate(value: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "1900-01-01" ||
    value > "2199-12-31"
  )
    throw new Error("Use a date from 1900 to 2199 in YYYY-MM-DD format.");
  const parsed = new Date(value + "T12:00:00Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new Error("Enter a valid calendar date.");
  return value;
}
export function todayInZone(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)?.value)
    .join("-");
}
export function addDays(date: string, days: number): string {
  const d = new Date(civilDate(date) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return civilDate(d.toISOString().slice(0, 10));
}
export function displayDate(value: string | null | undefined): string {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(civilDate(value) + "T12:00:00Z"));
}
