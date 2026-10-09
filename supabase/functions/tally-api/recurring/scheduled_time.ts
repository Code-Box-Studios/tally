import { civilDate, invalid } from "../shared/validation.ts";
import {
  hasZone,
  localWallMilliseconds,
  zoneOffsets,
} from "../shared/zone_data.ts";

export function validateScheduledTime(value: unknown): string {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return invalid("Enter a time from 00:00 to 23:59.");
  }
  return value;
}
export function validateScheduleZone(value: unknown): string {
  if (!hasZone(value)) return invalid("Choose a valid timezone.");
  return value;
}
export function scheduledInstant(
  date: string,
  localTime: string,
  timezone: string,
): Date {
  civilDate(date);
  validateScheduledTime(localTime);
  validateScheduleZone(timezone);
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [hour, minute] = localTime.split(":").map(Number) as [number, number];
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const exact: number[] = [], before: number[] = [], after: number[] = [];
  for (const offset of zoneOffsets(timezone)) {
    const candidate = wall - offset,
      actual = localWallMilliseconds(candidate, timezone);
    if (actual === wall) exact.push(candidate);
    else if (actual < wall) before.push(candidate);
    else after.push(candidate);
  }
  if (exact.length) return new Date(Math.min(...exact));
  if (!before.length || !after.length) {
    return invalid("Cannot resolve scheduled time.");
  }
  let low = Math.max(...before), high = Math.min(...after);
  if (low >= high) return invalid("Cannot resolve scheduled time.");
  // Select the first valid instant after a gap; never preserve skipped minutes.
  while (high - low > 1) {
    const middle = low + Math.floor((high - low) / 2);
    if (localWallMilliseconds(middle, timezone) >= wall) high = middle;
    else low = middle;
  }
  return new Date(high);
}
