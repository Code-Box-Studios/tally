import { expect, it } from "vitest";
import { selectLocalAlerts } from "../src/features/reminders/local-alerts";
const now = Date.parse("2026-10-09T00:00:00Z");
const policy = {
  enabled: true,
  localEnabled: true,
  enabledKinds: ["upcoming"],
};
const row = {
  id: "reminder-1",
  data: {
    kind: "upcoming",
    status: "scheduled",
    scheduledAt: "2026-10-09T01:00:00Z",
    obligationId: "o1",
  },
};
it("uses canonical server schedule, including quiet-hour and timezone decisions", () => {
  expect(selectLocalAlerts([row], policy, now)[0].at.toISOString()).toBe(
    new Date(row.data.scheduledAt).toISOString(),
  );
});
it("removes plans when reminders or local alerts are disabled", () => {
  expect(selectLocalAlerts([row], { ...policy, enabled: false }, now)).toEqual(
    [],
  );
  expect(
    selectLocalAlerts([row], { ...policy, localEnabled: false }, now),
  ).toEqual([]);
});
it("excludes cancelled, past and disabled reminder kinds", () => {
  expect(
    selectLocalAlerts(
      [
        { ...row, data: { ...row.data, status: "cancelled" } },
        {
          ...row,
          id: "past",
          data: { ...row.data, scheduledAt: "2026-10-08T01:00:00Z" },
        },
        { ...row, id: "off", data: { ...row.data, kind: "overdue" } },
      ],
      policy,
      now,
    ),
  ).toEqual([]);
});
it("caps native pending alerts at 32 and sorts by delivery time", () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({
    ...row,
    id: "r" + i,
    data: {
      ...row.data,
      scheduledAt: new Date(now + (40 - i) * 60000).toISOString(),
    },
  }));
  const result = selectLocalAlerts(rows, policy, now);
  expect(result).toHaveLength(32);
  expect(result[0].id).toBe("r39");
});
