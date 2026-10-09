import { expect, it } from "vitest";
import { summaries } from "../src/features/dashboard/calculations";
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
