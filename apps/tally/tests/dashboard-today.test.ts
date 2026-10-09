import { expect, it } from "vitest";
import { summaries } from "../src/features/dashboard/calculations";
it("separates today from later upcoming dues in the same currency", () => {
  const rows = [
    ["today", "2026-10-09", 1000],
    ["soon", "2026-10-15", 2000],
    ["later", "2026-10-18", 3000],
  ].map(([id, dueDate, amountMinor]) => ({
    id: String(id),
    data: {
      dueDate: String(dueDate),
      amountMinor: Number(amountMinor),
      remainingMinor: Number(amountMinor),
      section: "iOwe",
      currency: "PHP",
    },
  }));
  const result = summaries([], rows, [], "2026-10-09");
  expect(result.PHP?.dueToday).toBe(1000);
  expect(result.PHP?.dueSoon).toBe(2000);
});
