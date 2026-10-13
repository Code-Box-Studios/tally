import { expect, it } from "vitest";
import { summaries } from "../src/features/dashboard/calculations";
import type { Row } from "../src/core/domain/records";
it("includes paid periods in the original amount due this month", () => {
  const value = summaries(
    [],
    [
      {
        id: "paid",
        data: {
          currency: "PHP",
          section: "monthlyDues",
          dueDate: "2026-10-01",
          amountMinor: 10000,
          totalPaidMinor: 10000,
          remainingMinor: 0,
          closed: true,
          financialStatus: "paid",
        },
      },
    ],
    [],
    "2026-10-09",
  );
  expect(value.PHP?.dueMonth).toBe(10000);
  expect(value.PHP?.remainingMonth).toBe(0);
});
it("keeps skipped periods out of monthly dues and separates currencies", () => {
  const value = summaries(
    [],
    [
      {
        id: "skip",
        data: {
          currency: "PHP",
          section: "monthlyDues",
          dueDate: "2026-10-01",
          amountMinor: 10000,
          remainingMinor: 0,
          closed: true,
          financialStatus: "skipped",
        },
      },
      {
        id: "usd",
        data: {
          currency: "USD",
          section: "monthlyDues",
          dueDate: "2026-10-15",
          amountMinor: 2000,
          remainingMinor: 2000,
        },
      },
    ],
    [],
    "2026-10-09",
  );
  expect(value.PHP?.dueMonth ?? 0).toBe(0);
  expect(value.USD?.owe).toBe(2000);
});

it("keeps archived and cancelled bills out of dashboard totals while retaining paused and ended bills", () => {
  const obligations: Row[] = [
    { id: "archived", data: { section: "monthlyDues", archived: true } },
    {
      id: "cancelled",
      data: { section: "monthlyDues", lifecycle: "cancelled" },
    },
    { id: "paused", data: { section: "monthlyDues", lifecycle: "paused" } },
    { id: "ended", data: { section: "monthlyDues", lifecycle: "ended" } },
  ];
  const instances = obligations.map((parent) => ({
    id: `${parent.id}-oct`,
    data: {
      obligationId: parent.id,
      currency: "PHP",
      section: "monthlyDues",
      dueDate: "2026-10-01",
      amountMinor: 10000,
      remainingMinor: 10000,
      financialStatus: "pending",
    },
  }));
  const value = summaries(obligations, instances, [], "2026-10-09");
  expect(value.PHP?.owe).toBe(20000);
  expect(value.PHP?.remainingMonth).toBe(20000);
  expect(value.PHP?.overdue).toBe(20000);
});
