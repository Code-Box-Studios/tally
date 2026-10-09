const test = Deno.test;
import assert from "node:assert/strict";
import { defaultNotificationPolicy } from "../../functions/tally-api/notifications/policy.ts";
import {
  afterQuietHours,
  planReminders,
  reminderId,
  type ReminderSubject,
} from "../../functions/tally-api/notifications/schedule.ts";

const subject = (patch: Partial<ReminderSubject> = {}): ReminderSubject => ({
  instanceId: "bill-october",
  obligationId: "internet",
  section: "monthlyDues",
  dueDate: "2026-10-10",
  timezone: "Asia/Manila",
  paymentMode: "manual",
  closed: false,
  amountMinor: 169900,
  remainingMinor: 169900,
  requiresDeductionConfirmation: false,
  reminderPolicy: null,
  ...patch,
});
const now = new Date("2026-10-05T04:00:00.000Z");
const preferences = defaultNotificationPolicy();
test("civil due offsets and overdue cadence stay separate and bounded", () => {
  const plans = planReminders(subject(), preferences, "Asia/Manila", now);
  assert.deepEqual(
    plans.filter((p) => p.phase !== "overdue").map(
      (p) => [p.kind, p.civilTargetDate, p.scheduledAt.toISOString()],
    ),
    [
      ["upcoming", "2026-10-07", "2026-10-07T01:00:00.000Z"],
      ["dueToday", "2026-10-10", "2026-10-10T01:00:00.000Z"],
    ],
  );
  assert.deepEqual(
    plans.filter((p) => p.phase === "overdue").slice(0, 5).map((p) =>
      p.civilTargetDate
    ),
    [
      "2026-10-11",
      "2026-10-13",
      "2026-10-17",
      "2026-10-24",
      "2026-10-31",
    ],
  );
  assert.ok(plans.length <= 32);
});
test("leap-day offsets use civil arithmetic rather than UTC durations", () => {
  const plans = planReminders(
    subject({ dueDate: "2028-03-01" }),
    preferences,
    "Asia/Manila",
    new Date("2028-02-27T00:00:00Z"),
  );
  assert.equal(
    plans.find((p) => p.phase === "upcoming")!.civilTargetDate,
    "2028-02-27",
  );
  assert.equal(
    plans.find((p) => p.phase === "due")!.scheduledAt.toISOString(),
    "2028-03-01T01:00:00.000Z",
  );
});
test("saved spring gap and autumn overlap resolve independently of profile quiet zone", () => {
  const spring = planReminders(
    subject({
      dueDate: "2026-03-08",
      timezone: "America/New_York",
      reminderPolicy: { enabled: true, offsetDays: [0], localTime: "02:30" },
    }),
    { ...preferences, quietStart: "14:00", quietEnd: "16:00" },
    "Asia/Manila",
    new Date("2026-03-06T00:00:00Z"),
  );
  assert.equal(
    spring.find((p) => p.phase === "due")!.scheduledAt.toISOString(),
    "2026-03-08T08:00:00.000Z",
  );
  const autumn = planReminders(
    subject({
      dueDate: "2026-11-01",
      timezone: "America/New_York",
      reminderPolicy: { enabled: true, offsetDays: [0], localTime: "01:30" },
    }),
    { ...preferences, quietStart: "00:00", quietEnd: "00:00" },
    "Asia/Manila",
    new Date("2026-10-31T00:00:00Z"),
  );
  assert.equal(
    autumn.find((p) => p.phase === "due")!.scheduledAt.toISOString(),
    "2026-11-01T05:30:00.000Z",
  );
});
for (
  const [instant, zone, start, end, want] of [
    [
      "2026-10-05T13:00:00Z",
      "Asia/Manila",
      "21:00",
      "08:00",
      "2026-10-06T00:00:00.000Z",
    ],
    [
      "2026-10-05T00:00:00Z",
      "Asia/Manila",
      "21:00",
      "08:00",
      "2026-10-05T00:00:00.000Z",
    ],
    [
      "2026-10-05T09:00:00Z",
      "Asia/Manila",
      "17:00",
      "19:00",
      "2026-10-05T11:00:00.000Z",
    ],
    [
      "2026-10-05T09:00:00Z",
      "Asia/Manila",
      "17:00",
      "17:00",
      "2026-10-05T09:00:00.000Z",
    ],
    [
      "2026-11-01T05:30:00Z",
      "America/New_York",
      "01:00",
      "02:00",
      "2026-11-01T07:00:00.000Z",
    ],
    [
      "2026-03-08T06:45:00Z",
      "America/New_York",
      "01:00",
      "02:30",
      "2026-03-08T07:00:00.000Z",
    ],
    [
      "2026-11-01T06:15:00Z",
      "America/New_York",
      "00:00",
      "01:30",
      "2026-11-01T06:30:00.000Z",
    ],
  ]
) {
  test(`quiet hours ${instant} ${zone} ${start}–${end}`, () => {
    assert.equal(
      afterQuietHours(new Date(instant!), zone!, start!, end!).toISOString(),
      want,
    );
  });
}
test("100-year overdue subjects calculate the next window without scanning missed days", () => {
  const plans = planReminders(
    subject({ dueDate: "1926-10-05" }),
    preferences,
    "Asia/Manila",
    now,
  );
  assert.ok(plans.length > 0 && plans.length <= 15);
  assert.ok(
    plans.every((p) =>
      p.kind === "overdue" && p.civilTargetDate >= "2026-09-28" &&
      p.civilTargetDate <= "2027-01-03"
    ),
  );
  const times = plans.map((p) => Date.parse(`${p.civilTargetDate}T00:00:00Z`));
  for (let i = 1; i < times.length; i++) {
    assert.equal(times[i]! - times[i - 1]!, 7 * 86400000);
  }
});
test("automatic upcoming, confirmation and owed-to-me messages preserve their phase", () => {
  assert.equal(
    planReminders(
      subject({ paymentMode: "automatic" }),
      preferences,
      "Asia/Manila",
      now,
    ).find((p) => p.phase === "upcoming")!.kind,
    "automaticUpcoming",
  );
  assert.equal(
    planReminders(
      subject({
        paymentMode: "automaticConfirmation",
        requiresDeductionConfirmation: true,
      }),
      preferences,
      "Asia/Manila",
      now,
    ).filter((p) => p.kind === "automaticConfirmation").length,
    1,
  );
  const owed = planReminders(
    subject({ section: "owedToMe" }),
    preferences,
    "Asia/Manila",
    now,
  );
  assert.ok(owed.length > 0 && owed.every((p) => p.kind === "owedToMe"));
  assert.deepEqual(
    planReminders(
      subject({ section: "owedToMe" }),
      {
        ...preferences,
        enabledKinds: preferences.enabledKinds.filter((k) => k !== "owedToMe"),
      },
      "Asia/Manila",
      now,
    ),
    [],
  );
});
test("closed, disabled, settled and disabled snapshot policies suppress all plans", () => {
  for (
    const patch of [{ closed: true }, { remainingMinor: 0 }, {
      reminderPolicy: { enabled: false, offsetDays: [0], localTime: "09:00" },
    }]
  ) {
    assert.deepEqual(
      planReminders(subject(patch), preferences, "Asia/Manila", now),
      [],
    );
  }
  assert.deepEqual(
    planReminders(
      subject(),
      { ...preferences, enabled: false },
      "Asia/Manila",
      now,
    ),
    [],
  );
});
test("unknown bill creates useful dates without inventing an amount", () => {
  const input = subject({ amountMinor: null, remainingMinor: null });
  assert.ok(planReminders(input, preferences, "Asia/Manila", now).length > 0);
  assert.equal(input.amountMinor, null);
  assert.equal(input.remainingMinor, null);
});
test("confirmation uses its actual expectation instant and never generates a daily repeat", () => {
  const input = Object.assign(
    subject({
      paymentMode: "automaticConfirmation",
      requiresDeductionConfirmation: true,
    }),
    { confirmationAt: new Date("2026-10-10T10:00:00Z") },
  );
  for (const day of ["2026-10-10T11:00:00Z", "2026-10-11T11:00:00Z"]) {
    const plan = planReminders(input, preferences, "Asia/Manila", new Date(day))
      .find((p) => p.kind === "automaticConfirmation")!;
    assert.equal(plan.civilTargetDate, "2026-10-10");
    assert.equal(plan.scheduledAt.toISOString(), "2026-10-10T10:00:00.000Z");
  }
});
test("planning clips unsupported future dates and rejects bad timezones", () => {
  const plans = planReminders(
    subject({ dueDate: "2199-12-31" }),
    preferences,
    "Asia/Manila",
    new Date("2199-12-30T00:00:00Z"),
  );
  assert.ok(
    plans.length > 0 && plans.every((p) => p.civilTargetDate <= "2199-12-31"),
  );
  assert.throws(() =>
    planReminders(
      subject({ timezone: "Mars/Base" }),
      preferences,
      "Asia/Manila",
      now,
    )
  );
  assert.throws(() => afterQuietHours(now, "Asia/Manila", "24:00", "08:00"));
});
test("logical IDs isolate owners and policy/preference versions", () => {
  const id = reminderId("alice", "bill", "dueToday", "2026-10-10", 1, 1);
  assert.equal(reminderId("alice", "bill", "dueToday", "2026-10-10", 1, 1), id);
  assert.notEqual(
    reminderId("bob", "bill", "dueToday", "2026-10-10", 1, 1),
    id,
  );
  assert.notEqual(
    reminderId("alice", "bill", "dueToday", "2026-10-10", 2, 1),
    id,
  );
  assert.notEqual(
    reminderId("alice", "bill", "dueToday", "2026-10-10", 1, 2),
    id,
  );
});
