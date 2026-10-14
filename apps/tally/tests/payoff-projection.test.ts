import { describe, expect, it } from "vitest";
import type { Data, Row } from "../src/core/domain/records";
import { projectPayoff } from "../src/features/payoff/payoff-projection";

function loan(patch: Data = {}): Row {
  return {
    id: "loan",
    data: {
      type: "loan",
      section: "owedByMe",
      lifecycle: "active",
      currency: "PHP",
      originalAmountMinor: 30000,
      totalPaidMinor: 0,
      remainingMinor: 30000,
      originationDate: "2026-01-01",
      dueDate: "2026-04-30",
      ...patch,
    },
  };
}

function schedule(
  dates: string[],
  amounts: number[],
  paid: number[] = [],
): Row[] {
  return dates.map((dueDate, index) => ({
    id: `period-${index}`,
    data: {
      obligationId: "loan",
      currency: "PHP",
      dueDate,
      amountMinor: amounts[index],
      totalPaidMinor: paid[index] ?? 0,
      remainingMinor: amounts[index] - (paid[index] ?? 0),
      closed: amounts[index] === paid[index],
    },
  }));
}

function installment(instances: Row[], patch: Data = {}): Row {
  return loan({
    type: "installment",
    installmentInstanceIds: instances.map((row) => row.id),
    originalAmountMinor: instances.reduce(
      (total, row) => total + Number(row.data.amountMinor),
      0,
    ),
    totalPaidMinor: instances.reduce(
      (total, row) => total + Number(row.data.totalPaidMinor),
      0,
    ),
    remainingMinor: instances.reduce(
      (total, row) => total + Number(row.data.remainingMinor),
      0,
    ),
    ...patch,
  });
}

const options = {
  today: "2026-01-31",
  extraMonthlyMinor: 5000,
  firstExtraDate: "2026-01-31",
};

function ready(result: ReturnType<typeof projectPayoff>) {
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error("Expected a projection.");
  return result;
}

describe("payoff projection", () => {
  it.each(["owedByMe", "owedToMe"])(
    "projects canonical %s loan records",
    (type) => {
      const result = ready(projectPayoff(loan({ type }), [], options));
      expect(result.baseline.payoffDate).toBe("2026-04-30");
      expect(result.remainingMinor).toBe(30000);
    },
  );
  it("uses saved irregular installment amounts and preserves cents in the final payment", () => {
    const periods = schedule(
      ["2026-02-05", "2026-02-19", "2026-04-12"],
      [10001, 7500, 12499],
    );
    const result = ready(projectPayoff(installment(periods), periods, options));
    expect(result.baseline.payoffDate).toBe("2026-04-12");
    expect(result.accelerated.payoffDate).toBe("2026-03-31");
    expect(result.daysEarlier).toBe(12);
    expect(result.accelerated.payments.at(-1)).toMatchObject({
      date: "2026-03-31",
      scheduledMinor: 0,
      extraMinor: 2499,
      remainingMinor: 0,
    });
    expect(result.accelerated.totalPaidMinor).toBe(30000);
  });

  it("leaves the saved payment timeline unchanged when extra payment is zero", () => {
    const periods = schedule(["2026-02-05", "2026-03-05"], [10000, 20000]);
    const result = ready(
      projectPayoff(installment(periods), periods, {
        ...options,
        extraMonthlyMinor: 0,
      }),
    );
    expect(result.accelerated).toEqual(result.baseline);
    expect(result.daysEarlier).toBe(0);
  });

  it("uses only remaining portions of partially paid and fully paid installments", () => {
    const periods = schedule(
      ["2026-01-05", "2026-02-05", "2026-03-05"],
      [10000, 10000, 10000],
      [10000, 2500, 0],
    );
    const result = ready(projectPayoff(installment(periods), periods, options));
    expect(result.remainingMinor).toBe(17500);
    expect(
      result.baseline.payments.map((payment) => payment.scheduledMinor),
    ).toEqual([7500, 10000]);
    expect(result.accelerated.payoffDate).toBe("2026-02-28");
    expect(result.accelerated.totalPaidMinor).toBe(17500);
  });

  it("anchors monthly extra dates through February and restores the original day", () => {
    const result = ready(
      projectPayoff(
        loan({ originationDate: "2028-01-01", dueDate: "2028-06-30" }),
        [],
        {
          today: "2028-01-31",
          firstExtraDate: "2028-01-31",
          extraMonthlyMinor: 10000,
        },
      ),
    );
    expect(result.accelerated.payments.map((payment) => payment.date)).toEqual([
      "2028-01-31",
      "2028-02-29",
      "2028-03-31",
    ]);
  });

  it("caps a large extra payment at the recorded remaining balance", () => {
    const result = ready(
      projectPayoff(loan(), [], { ...options, extraMonthlyMinor: 100000 }),
    );
    expect(result.accelerated.payments).toEqual([
      {
        date: "2026-01-31",
        scheduledMinor: 0,
        extraMinor: 30000,
        remainingMinor: 0,
      },
    ]);
    expect(result.accelerated.totalPaidMinor).toBe(30000);
  });

  it("counts same-day scheduled payments before the extra payment", () => {
    const periods = schedule(["2026-01-31", "2026-02-28"], [10000, 20000]);
    const result = ready(
      projectPayoff(installment(periods), periods, {
        ...options,
        extraMonthlyMinor: 25000,
      }),
    );
    expect(result.accelerated.payments).toEqual([
      {
        date: "2026-01-31",
        scheduledMinor: 10000,
        extraMinor: 20000,
        remainingMinor: 0,
      },
    ]);
  });

  it.each([
    {
      calculationVersion: 1,
      principalMinor: 25000,
      interestMinor: 5000,
      totalMinor: 30000,
    },
    {
      calculationVersion: 2,
      principalMinor: 25000,
      interestMinor: 5000,
      totalMinor: 30000,
      method: { kind: "compound", intervalDays: 30 },
    },
  ] as Data[])(
    "never reduces saved fixed interest when paying early: %j",
    (interestInfo) => {
      const result = ready(projectPayoff(loan({ interestInfo }), [], options));
      expect(result.interestKind).toBe("fixed");
      expect(result.interestSavingsMinor).toBe(0);
      expect(result.baseline.totalPaidMinor).toBe(30000);
      expect(result.accelerated.totalPaidMinor).toBe(30000);
    },
  );

  it("does not claim interest savings from legacy informational terms", () => {
    const result = ready(
      projectPayoff(
        loan({ interestInfo: { rateBasisPoints: 1200 } }),
        [],
        options,
      ),
    );
    expect(result.interestKind).toBe("informational");
    expect(result.interestSavingsMinor).toBeNull();
  });

  it("projects overdue balances from today and reports the catch-up assumption", () => {
    const periods = schedule(["2026-01-05", "2026-03-05"], [10000, 20000]);
    const result = ready(projectPayoff(installment(periods), periods, options));
    expect(result.overdueMinor).toBe(10000);
    expect(result.baseline.payments[0]).toMatchObject({
      date: "2026-01-31",
      scheduledMinor: 10000,
    });
  });

  it("requires a hypothetical monthly payment when no due date is saved", () => {
    const result = projectPayoff(loan({ dueDate: null }), [], options);
    expect(result.status).toBe("needsMonthlyPayment");
  });

  it("compares a user-entered monthly plan without inventing saved terms", () => {
    const result = ready(
      projectPayoff(loan({ dueDate: null }), [], {
        ...options,
        monthlyPaymentMinor: 10000,
        firstPaymentDate: "2026-02-28",
      }),
    );
    expect(result.usesHypotheticalPayments).toBe(true);
    expect(result.baseline.payoffDate).toBe("2026-04-28");
    expect(result.accelerated.payoffDate).toBe("2026-03-28");
  });

  it("uses the single instance due date when the parent has no due date", () => {
    const periods = schedule(["2026-05-01"], [30000]);
    const result = ready(
      projectPayoff(
        loan({ dueDate: null, singleInstanceId: "period-0" }),
        periods,
        options,
      ),
    );
    expect(result.baseline.payoffDate).toBe("2026-05-01");
    expect(result.usesHypotheticalPayments).toBe(false);
  });

  it("rejects missing, duplicate, stale, and mixed-currency installment schedules", () => {
    const periods = schedule(["2026-02-05", "2026-03-05"], [10000, 20000]);
    const parent = installment(periods);
    const invalid = [
      periods.slice(1),
      [periods[0], periods[0]],
      [
        periods[0],
        { ...periods[1], data: { ...periods[1].data, remainingMinor: 19999 } },
      ],
      [
        periods[0],
        { ...periods[1], data: { ...periods[1].data, currency: "USD" } },
      ],
    ];
    for (const rows of invalid) {
      expect(() => projectPayoff(parent, rows, options)).toThrow(
        /complete installment schedule/i,
      );
    }
  });

  it.each([
    { section: "monthlyDues" },
    { type: "revolvingCredit" },
    { lifecycle: "cancelled" },
    { archived: true },
  ] as Data[])("does not project ineligible obligations: %j", (patch) => {
    expect(projectPayoff(loan(patch), [], options).status).toBe("unavailable");
  });

  it("reports settled loans without inventing a future payoff date", () => {
    expect(
      projectPayoff(
        loan({ totalPaidMinor: 30000, remainingMinor: 0 }),
        [],
        options,
      ).status,
    ).toBe("paid");
  });

  it("does not alter recorded balances, interest, or installment dates", () => {
    const periods = schedule(["2026-02-05", "2026-03-05"], [10000, 20000]);
    const parent = installment(periods);
    const original = JSON.stringify({ parent, periods });
    projectPayoff(parent, periods, options);
    expect(JSON.stringify({ parent, periods })).toBe(original);
  });

  it("rejects inconsistent parent balances instead of projecting a stale balance", () => {
    expect(() =>
      projectPayoff(loan({ totalPaidMinor: 1 }), [], options),
    ).toThrow(/balances/i);
  });

  it.each([-1, 0.1, Number.NaN, 1e12 + 1])(
    "rejects invalid extra amounts: %s",
    (extraMonthlyMinor) => {
      expect(() =>
        projectPayoff(loan(), [], { ...options, extraMonthlyMinor }),
      ).toThrow();
    },
  );

  it("rejects extra payments before today", () => {
    expect(() =>
      projectPayoff(loan(), [], { ...options, firstExtraDate: "2026-01-30" }),
    ).toThrow(/today/i);
  });

  it("rejects a hypothetical monthly plan that cannot finish within supported dates", () => {
    expect(() =>
      projectPayoff(loan({ dueDate: null }), [], {
        ...options,
        monthlyPaymentMinor: 1,
        firstPaymentDate: "2199-12-31",
      }),
    ).toThrow(/2199/);
  });

  it("handles the final supported month without attempting a year-2200 extra payment", () => {
    const result = ready(
      projectPayoff(loan({ dueDate: "2199-12-31" }), [], {
        today: "2199-12-01",
        firstExtraDate: "2199-12-31",
        extraMonthlyMinor: 1,
      }),
    );
    expect(result.accelerated.payoffDate).toBe("2199-12-31");
    expect(result.accelerated.totalPaidMinor).toBe(30000);
  });
});
