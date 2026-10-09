const test = Deno.test;
import assert from "node:assert/strict";
import {
  defaultNotificationPolicy,
  migrateNotificationPolicy,
  validateNotificationPolicy,
} from "../../functions/tally-api/notifications/policy.ts";

test("canonical defaults give an inbox without requesting external permission", () => {
  const policy = defaultNotificationPolicy();
  assert.equal(policy.enabled, true);
  assert.deepEqual(policy.offsetDays, [3, 0]);
  assert.equal(policy.localTime, "09:00");
  assert.equal(policy.quietStart, "21:00");
  assert.equal(policy.quietEnd, "08:00");
  assert.equal(policy.pushEnabled, false);
  assert.equal(policy.localEnabled, false);
  assert.equal(policy.allowSensitivePushText, false);
  assert.equal(policy.timezonePolicy, "savedDueProfileQuiet");
  assert.deepEqual(policy.enabledKinds, [
    "upcoming",
    "dueToday",
    "overdue",
    "automaticUpcoming",
    "automaticConfirmation",
    "owedToMe",
  ]);
});
test("legacy migration preserves explicit disable, push and custom offset/time choices", () => {
  const migrated = migrateNotificationPolicy({
    enabled: false,
    pushEnabled: true,
    offsetDays: [7, 1, 0],
    localTime: "10:45",
    revision: 4,
  });
  assert.equal(migrated.enabled, false);
  assert.equal(migrated.pushEnabled, true);
  assert.deepEqual(migrated.offsetDays, [7, 1, 0]);
  assert.equal(migrated.localTime, "10:45");
  assert.equal(migrated.quietStart, "21:00");
  assert.equal(migrated.localEnabled, false);
});
test("policy isolates mutable input lists and retains a valid empty offset selection", () => {
  const input = { ...defaultNotificationPolicy(), offsetDays: [365, 1, 0] };
  const policy = validateNotificationPolicy(input);
  input.offsetDays.push(2);
  assert.deepEqual(policy.offsetDays, [365, 1, 0]);
  assert.deepEqual(
    validateNotificationPolicy({ ...input, offsetDays: [] }).offsetDays,
    [],
  );
});
for (
  const patch of [
    { enabled: "true" },
    { pushEnabled: 1 },
    { localEnabled: null },
    { enabledKinds: ["unknown"] },
    { enabledKinds: ["upcoming", "upcoming"] },
    { offsetDays: [1, 1] },
    { offsetDays: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
    { offsetDays: [-1] },
    { offsetDays: [366] },
    { offsetDays: [1.5] },
    { offsetDays: ["1"] },
    { localTime: "24:00" },
    { localTime: "9:00" },
    { quietStart: "21:60" },
    { quietEnd: "08:00\n" },
    { allowSensitivePushText: true },
    { timezonePolicy: "device" },
    { extra: "ignored" },
  ]
) {
  test(`invalid policy ${JSON.stringify(patch)} is rejected`, () => {
    assert.throws(() =>
      validateNotificationPolicy({ ...defaultNotificationPolicy(), ...patch })
    );
  });
}
test("partial or corrupt legacy preferences fail closed instead of inventing choices", () => {
  assert.throws(() => migrateNotificationPolicy({ enabled: "yes" }));
  assert.throws(() => validateNotificationPolicy({ enabled: true }));
});
