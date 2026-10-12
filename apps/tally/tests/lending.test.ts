import { describe, expect, it } from "vitest";
import {
  calculateInterest,
  generateInstallments,
} from "../src/features/obligations/lending-calculations";

describe("simple interest calculator", () => {
  it("adds one flat charge to principal and rounds half up exactly once", () => {
    expect(
      calculateInterest(100000, 500, "oneTime", "2026-10-01", null),
    ).toMatchObject({
      principalMinor: 100000,
      interestMinor: 5000,
      totalMinor: 105000,
    });
    expect(
      calculateInterest(1, 5000, "oneTime", "2026-10-01", null).interestMinor,
    ).toBe(1);
  });
  it("uses actual civil days over 30 for monthly rates, including month-end and leap day", () => {
    expect(
      calculateInterest(100000, 300, "monthly", "2028-01-31", "2028-02-29"),
    ).toMatchObject({ dayCount: 29, interestMinor: 2900, totalMinor: 102900 });
    expect(
      calculateInterest(100000, 300, "monthly", "2026-03-07", "2026-03-09"),
    ).toMatchObject({ dayCount: 2, interestMinor: 200 });
  });
  it("uses actual days over 365 for annual rates without compounding", () => {
    expect(
      calculateInterest(1000000, 1200, "annual", "2026-01-01", "2027-01-01"),
    ).toMatchObject({
      dayCount: 365,
      interestMinor: 120000,
      totalMinor: 1120000,
    });
    expect(
      calculateInterest(1000000, 1200, "annual", "2028-01-01", "2029-01-01"),
    ).toMatchObject({ dayCount: 366, interestMinor: 120329 });
  });
  it("requires an ordered due date for time-based rates and rejects overflow or fractional minor amounts", () => {
    expect(() =>
      calculateInterest(100000, 300, "monthly", "2026-10-01", null),
    ).toThrow(/due date/i);
    expect(() =>
      calculateInterest(100000, 300, "annual", "2026-10-10", "2026-10-01"),
    ).toThrow(/due date/i);
    expect(() =>
      calculateInterest(1e12, 1, "oneTime", "2026-10-01", null),
    ).toThrow();
    expect(() =>
      calculateInterest(1.2, 300, "oneTime", "2026-10-01", null),
    ).toThrow();
    expect(() =>
      calculateInterest(1, 100001, "oneTime", "2026-10-01", null),
    ).toThrow(/rate/i);
  });
});

describe("installment schedule generator", () => {
  it("splits the exact total and puts rounding remainder in the last installment", () => {
    expect(generateInstallments(10000, 3, "2026-01-31", "monthly")).toEqual([
      { amountMinor: 3333, dueDate: "2026-01-31" },
      { amountMinor: 3333, dueDate: "2026-02-28" },
      { amountMinor: 3334, dueDate: "2026-03-31" },
    ]);
  });
  it("anchors every date to the first due date instead of drifting after a short month", () => {
    expect(
      generateInstallments(100, 3, "2028-01-30", "monthly").map(
        (i) => i.dueDate,
      ),
    ).toEqual(["2028-01-30", "2028-02-29", "2028-03-30"]);
    expect(
      generateInstallments(100, 3, "2026-02-28", "monthly").map(
        (i) => i.dueDate,
      ),
    ).toEqual(["2026-02-28", "2026-03-28", "2026-04-28"]);
    expect(
      generateInstallments(100, 3, "2026-10-01", "biweekly").map(
        (i) => i.dueDate,
      ),
    ).toEqual(["2026-10-01", "2026-10-15", "2026-10-29"]);
  });
  it("rejects invalid counts, zero installments and out-of-range final dates", () => {
    for (const count of [1, 121, 2.5])
      expect(() =>
        generateInstallments(10000, count, "2026-10-01", "monthly"),
      ).toThrow();
    expect(() => generateInstallments(2, 3, "2026-10-01", "monthly")).toThrow(
      /small/i,
    );
    expect(() =>
      generateInstallments(10000, 2, "2199-12-31", "monthly"),
    ).toThrow();
  });
});
