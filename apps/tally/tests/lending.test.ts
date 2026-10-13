import { describe, expect, it } from "vitest";
import {
  calculateInterest,
  calculateCustomInterest,
  generateInstallments,
  type CustomInterestOptions,
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

describe("custom agreed interest calculator", () => {
  const options: CustomInterestOptions = {
    charge: { kind: "percentage", rateBasisPoints: 300 },
    ratePeriod: { kind: "days", days: 30 },
    method: { kind: "simple" },
    rounding: "halfUp",
    originationDate: "2026-10-01",
    dueDate: "2026-11-30",
  };

  it("supports daily, weekly and custom-day simple rates", () => {
    for (const [days, rateBasisPoints, dueDate, interestMinor] of [
      [1, 200, "2026-10-04", 6000],
      [7, 100, "2026-10-11", 1429],
      [17, 300, "2026-11-04", 6000],
    ] as const) {
      expect(
        calculateCustomInterest(100000, {
          ...options,
          charge: { kind: "percentage", rateBasisPoints },
          ratePeriod: { kind: "days", days },
          dueDate,
        }),
      ).toMatchObject({ calculationVersion: 2, interestMinor });
    }
  });

  it("calculates one-time and prorated fixed cash charges", () => {
    expect(
      calculateCustomInterest(100000, {
        ...options,
        charge: { kind: "fixedAmount", amountMinor: 5000 },
        ratePeriod: { kind: "oneTime" },
        dueDate: null,
      }),
    ).toMatchObject({ dayCount: 0, interestMinor: 5000, totalMinor: 105000 });
    expect(
      calculateCustomInterest(100000, {
        ...options,
        charge: { kind: "fixedAmount", amountMinor: 5000 },
        dueDate: "2026-11-15",
      }),
    ).toMatchObject({ dayCount: 45, interestMinor: 7500, totalMinor: 107500 });
  });

  it("compounds full cycles and accrues a simple final partial cycle", () => {
    expect(
      calculateCustomInterest(100000, {
        ...options,
        method: { kind: "compound", intervalDays: 30 },
      }),
    ).toMatchObject({ dayCount: 60, interestMinor: 6090, totalMinor: 106090 });
    expect(
      calculateCustomInterest(100000, {
        ...options,
        method: { kind: "compound", intervalDays: 30 },
        dueDate: "2026-12-05",
      }),
    ).toMatchObject({ dayCount: 65, interestMinor: 6620, totalMinor: 106620 });
  });

  it("supports a compounding interval distinct from the rate period", () => {
    expect(
      calculateCustomInterest(1000000, {
        ...options,
        charge: { kind: "percentage", rateBasisPoints: 1200 },
        ratePeriod: { kind: "days", days: 365 },
        method: { kind: "compound", intervalDays: 1 },
        originationDate: "2026-01-01",
        dueDate: "2027-01-01",
      }),
    ).toMatchObject({ interestMinor: 127475, totalMinor: 1127475 });
  });

  it("rounds only the final charge, including exact half-minor values", () => {
    for (const [rounding, interestMinor] of [
      ["halfUp", 1],
      ["down", 0],
      ["up", 1],
    ] as const) {
      expect(
        calculateCustomInterest(1, {
          ...options,
          charge: { kind: "percentage", rateBasisPoints: 5000 },
          ratePeriod: { kind: "oneTime" },
          rounding,
          dueDate: null,
        }).interestMinor,
      ).toBe(interestMinor);
    }
    expect(
      calculateCustomInterest(1, {
        ...options,
        charge: { kind: "percentage", rateBasisPoints: 5000 },
        ratePeriod: { kind: "days", days: 1 },
        method: { kind: "compound", intervalDays: 1 },
        dueDate: "2026-10-03",
      }),
    ).toMatchObject({ interestMinor: 1, totalMinor: 2 });
  });

  it("keeps leap-year actual days and zero-length terms explicit", () => {
    expect(
      calculateCustomInterest(100000, {
        ...options,
        originationDate: "2028-01-31",
        dueDate: "2028-02-29",
      }),
    ).toMatchObject({ dayCount: 29, interestMinor: 2900 });
    expect(
      calculateCustomInterest(100000, {
        ...options,
        method: { kind: "compound", intervalDays: 30 },
        dueDate: options.originationDate,
        rounding: "up",
      }),
    ).toMatchObject({ dayCount: 0, interestMinor: 0, totalMinor: 100000 });
  });

  it("rejects incompatible methods, unordered dates and unsafe intervals", () => {
    const invalid: unknown[] = [
      { ...options, dueDate: null },
      { ...options, dueDate: "2026-09-30" },
      { ...options, dueDate: "2026-02-30" },
      { ...options, rounding: "nearest" },
      { ...options, charge: { kind: "percentage", rateBasisPoints: 100001 } },
      { ...options, charge: { kind: "fixedAmount", amountMinor: -1 } },
      {
        ...options,
        charge: { kind: "percentage", rateBasisPoints: 300, fee: 1 },
      },
      { ...options, ratePeriod: { kind: "days", days: 0 } },
      { ...options, ratePeriod: { kind: "days", days: 36501 } },
      { ...options, ratePeriod: { kind: "days", days: 1.5 } },
      { ...options, method: { kind: "compound", intervalDays: 0 } },
      { ...options, method: { kind: "compound", intervalDays: 36501 } },
      {
        ...options,
        ratePeriod: { kind: "oneTime" },
        method: { kind: "compound", intervalDays: 1 },
      },
      {
        ...options,
        charge: { kind: "fixedAmount", amountMinor: 100 },
        method: { kind: "compound", intervalDays: 1 },
      },
    ];
    for (const input of invalid)
      expect(() =>
        calculateCustomInterest(100000, input as CustomInterestOptions),
      ).toThrow();
    expect(() => calculateCustomInterest(1.2, options)).toThrow();
  });

  it("rejects rounding objects even when they stringify to a supported rule", () => {
    expect(() =>
      calculateCustomInterest(1, {
        ...options,
        rounding: { toString: () => "up" },
      } as unknown as CustomInterestOptions),
    ).toThrow();
  });

  it("matches independent server verification for every charge and rounding mode", async () => {
    // Deno's explicit .ts imports stay outside the application's TypeScript module graph.
    const serverModule = new URL(
      "../../../supabase/functions/tally-api/obligations/interest_calculation.ts",
      import.meta.url,
    ).href;
    const { calculateCustomInterest: verifyCustomInterest } = (await import(
      serverModule
    )) as {
      calculateCustomInterest: typeof calculateCustomInterest;
    };
    const cases: CustomInterestOptions[] = [
      options,
      {
        ...options,
        method: { kind: "compound", intervalDays: 30 },
        dueDate: "2026-12-05",
      },
      {
        ...options,
        method: { kind: "compound", intervalDays: 1 },
        ratePeriod: { kind: "days", days: 365 },
      },
      {
        ...options,
        charge: { kind: "fixedAmount", amountMinor: 5 },
        ratePeriod: { kind: "days", days: 17 },
      },
      {
        ...options,
        charge: { kind: "fixedAmount", amountMinor: 0 },
        dueDate: options.originationDate,
      },
      {
        ...options,
        charge: { kind: "percentage", rateBasisPoints: 0 },
        ratePeriod: { kind: "oneTime" },
        dueDate: null,
      },
      {
        ...options,
        charge: { kind: "percentage", rateBasisPoints: 5000 },
        ratePeriod: { kind: "oneTime" },
        dueDate: null,
      },
    ];
    for (const principal of [1, 101, 100000, 900000000000]) {
      for (const terms of cases) {
        for (const rounding of ["halfUp", "down", "up"] as const) {
          const input = { ...terms, rounding };
          let client;
          try {
            client = calculateCustomInterest(principal, input);
          } catch {
            expect(() => verifyCustomInterest(principal, input)).toThrow();
            continue;
          }
          expect(verifyCustomInterest(principal, input)).toEqual(client);
        }
      }
    }
  });

  it("bounds extreme compound debt without losing tiny long-term charges", () => {
    expect(() =>
      calculateCustomInterest(100000, {
        ...options,
        charge: { kind: "percentage", rateBasisPoints: 100000 },
        ratePeriod: { kind: "days", days: 1 },
        method: { kind: "compound", intervalDays: 1 },
        originationDate: "1900-01-01",
        dueDate: "2199-12-31",
      }),
    ).toThrow(/amount|range|large/i);
    expect(
      calculateCustomInterest(1, {
        ...options,
        charge: { kind: "percentage", rateBasisPoints: 1 },
        ratePeriod: { kind: "days", days: 36500 },
        method: { kind: "compound", intervalDays: 1 },
        originationDate: "1900-01-01",
        dueDate: "2199-12-31",
        rounding: "up",
      }),
    ).toMatchObject({ interestMinor: 1, totalMinor: 2 });
    expect(
      calculateCustomInterest(1e12, {
        ...options,
        charge: { kind: "fixedAmount", amountMinor: 0 },
      }).totalMinor,
    ).toBe(1e12);
    expect(() => calculateCustomInterest(1e12, options)).toThrow();
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
