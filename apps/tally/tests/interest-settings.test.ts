import { expect, it } from "vitest";
import {
  customInterestOptions,
  loanTermDueDate,
  readInterestSettings,
} from "../src/features/obligations/interest-settings";

it("sets calendar loan lengths using a stable month anchor", () => {
  expect(loanTermDueDate("2028-01-31", "1", "months")).toBe("2028-02-29");
  expect(loanTermDueDate("2028-01-31", "2", "months")).toBe("2028-03-31");
  expect(loanTermDueDate("2028-02-29", "1", "years")).toBe("2029-02-28");
  expect(loanTermDueDate("2026-10-01", "3", "weeks")).toBe("2026-10-22");
});
it("rejects fractional loan lengths and unsupported resulting dates", () => {
  expect(() => loanTermDueDate("2026-10-01", "1.5", "months")).toThrow();
  expect(() => loanTermDueDate("2199-12-31", "1", "days")).toThrow();
});
it("restores compound fixed-day settings without treating total as principal", () => {
  const saved = {
    calculationVersion: 2,
    principalMinor: 100000,
    totalMinor: 110000,
    charge: { kind: "percentage", rateBasisPoints: 325 },
    ratePeriod: { kind: "days", days: 14 },
    method: { kind: "compound", intervalDays: 7 },
    rounding: "up",
    agreementNotes: "Signed",
  };
  const settings = readInterestSettings(saved, "PHP");
  expect(settings).toMatchObject({
    rate: "3.25",
    period: "custom",
    periodDays: "14",
    compoundDays: "7",
    rounding: "up",
    agreementNotes: "Signed",
  });
  expect(
    customInterestOptions(settings, "2026-10-01", "2026-10-31", "PHP"),
  ).toMatchObject({
    charge: saved.charge,
    ratePeriod: saved.ratePeriod,
    method: saved.method,
    rounding: saved.rounding,
  });
});
it("handles zero charges while enforcing currency precision", () => {
  const settings = {
    ...readInterestSettings(null, "PHP"),
    chargeKind: "fixedAmount" as const,
    fixedAmount: "0.00",
  };
  expect(
    customInterestOptions(settings, "2026-10-01", null, "PHP").charge,
  ).toEqual({ kind: "fixedAmount", amountMinor: 0 });
  expect(() =>
    customInterestOptions(settings, "2026-10-01", null, "JPY"),
  ).toThrow();
});
