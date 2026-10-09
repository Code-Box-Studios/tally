const test = Deno.test;
import assert from "node:assert/strict";
import { calculateBalance } from "../../functions/tally-api/payments/calculation.ts";
import { statusForBalance } from "../../functions/tally-api/shared/financial_status.ts";
import { localToday } from "../../functions/tally-api/shared/validation.ts";
test("partial, full, multiple payments and reversal preserve exact principal", () => {
  assert.deepEqual(calculateBalance(1_000_000, 0, 300_000), {
    totalPaidMinor: 300_000,
    remainingMinor: 700_000,
  });
  let paid = 0;
  for (const amount of [500_000, 250_000, 400_000]) {
    paid = calculateBalance(2_000_000, paid, amount).totalPaidMinor;
  }
  assert.equal(calculateBalance(2_000_000, paid, 0).remainingMinor, 850_000);
  assert.deepEqual(calculateBalance(1_000_000, 300_000, 700_000), {
    totalPaidMinor: 1_000_000,
    remainingMinor: 0,
  });
  assert.deepEqual(calculateBalance(1_000_000, 300_000, -300_000), {
    totalPaidMinor: 0,
    remainingMinor: 1_000_000,
  });
});
test("overpayment and inconsistent history cannot produce negative balances", () => {
  assert.throws(() => calculateBalance(200_000, 0, 250_000), {
    code: "failed-precondition",
  });
  assert.throws(() => calculateBalance(200_000, 10_000, -20_000), {
    code: "failed-precondition",
  });
  for (
    const input of [[1_000_000_000_001, 0, 1], [10, 11, 0], [10, 1, Infinity], [
      10,
      1,
      0.5,
    ], [Number.MAX_SAFE_INTEGER + 1, 0, 1]]
  ) assert.throws(() => calculateBalance(input[0]!, input[1]!, input[2]!));
});
test("due status and local payment date use civil semantics", () => {
  assert.equal(statusForBalance(0, 500, "2026-10-03", "2026-10-04"), "overdue");
  assert.equal(statusForBalance(500, 0, "2026-10-03", "2026-10-04"), "paid");
  assert.equal(
    statusForBalance(100, 400, "2026-10-04", "2026-10-04"),
    "partiallyPaid",
  );
  assert.equal(
    localToday("Asia/Manila", new Date("2026-10-03T23:30:00Z")),
    "2026-10-04",
  );
  assert.equal(
    localToday("America/New_York", new Date("2026-10-03T23:30:00Z")),
    "2026-10-03",
  );
});
