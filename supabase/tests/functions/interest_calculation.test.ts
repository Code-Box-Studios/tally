import assert from "node:assert/strict";
import { calculateSimpleInterest } from "../../functions/tally-api/obligations/interest_calculation.ts";
import {
  terms,
  validateObligationCreation,
} from "../../functions/tally-api/obligations/obligation_service.ts";
import { calculateBalance } from "../../functions/tally-api/payments/calculation.ts";
const loan = (interestInfo: unknown, amountMinor = 105000) => ({
  title: "Loan",
  description: "",
  notes: "",
  direction: "owedToMe",
  currency: "PHP",
  amountMinor,
  originationDate: "2026-10-01",
  dueDate: "2026-10-31",
  contactId: null,
  categoryId: "default-personal-loan",
  paymentSourceId: null,
  interestInfo,
});
const flat = {
  calculationVersion: 1,
  principalMinor: 100000,
  rateBasisPoints: 500,
  basis: "oneTime",
  originationDate: "2026-10-01",
  dueDate: "2026-10-31",
  dayCount: 30,
  interestMinor: 5000,
  totalMinor: 105000,
  agreementNotes: "",
};
const snapshots = {
  contactSnapshot: null,
  categorySnapshot: { name: "Personal Loan" },
  sourceSnapshot: null,
};
Deno.test("simple interest computes exact flat, actual/30 and actual/365 totals", () => {
  assert.equal(
    calculateSimpleInterest(100000, 500, "oneTime", "2026-10-01", null)
      .totalMinor,
    105000,
  );
  assert.equal(
    calculateSimpleInterest(100000, 300, "monthly", "2028-01-31", "2028-02-29")
      .interestMinor,
    2900,
  );
  assert.equal(
    calculateSimpleInterest(1000000, 1200, "annual", "2028-01-01", "2029-01-01")
      .interestMinor,
    120329,
  );
  assert.equal(
    calculateSimpleInterest(1, 5000, "oneTime", "2026-10-01", null)
      .interestMinor,
    1,
  );
});
Deno.test("verified interest total becomes the persisted debt and subsequent payment balance", () => {
  const parsed = validateObligationCreation(loan(flat));
  assert.equal(terms(parsed, snapshots).originalAmountMinor, 105000);
  assert.deepEqual(calculateBalance(parsed.amountMinor, 0, 5000), {
    totalPaidMinor: 5000,
    remainingMinor: 100000,
  });
});
Deno.test("tampered principal, charge, dates and total cannot enter the ledger", () => {
  for (
    const changed of [
      { ...flat, principalMinor: 110000 },
      { ...flat, interestMinor: 6000 },
      { ...flat, dueDate: "2026-11-01" },
      { ...flat, dayCount: 31 },
      { ...flat, totalMinor: 104999 },
      { ...flat, calculationVersion: 2 },
    ]
  ) {
    assert.throws(() => validateObligationCreation(loan(changed)), {
      code: "invalid-argument",
    });
  }
  assert.throws(() => validateObligationCreation(loan(flat, 100000)), {
    code: "invalid-argument",
  });
});
Deno.test("legacy informational interest remains unchanged and does not add another charge", () => {
  const legacy = {
    rateBasisPoints: 500,
    basis: "annual",
    agreementNotes: "Old agreement",
  };
  const parsed = validateObligationCreation(loan(legacy, 100000));
  assert.equal(terms(parsed, snapshots).originalAmountMinor, 100000);
  assert.deepEqual(parsed.interestInfo, legacy);
});
Deno.test("dated interest rejects missing due dates, invalid rates and unsupported amounts", () => {
  assert.throws(() =>
    calculateSimpleInterest(100000, 300, "monthly", "2026-10-01", null)
  );
  assert.throws(() =>
    calculateSimpleInterest(100000, 300, "annual", "2026-10-10", "2026-10-01")
  );
  assert.throws(() =>
    calculateSimpleInterest(1e12, 1, "oneTime", "2026-10-01", null)
  );
  assert.throws(() =>
    calculateSimpleInterest(1, 100001, "oneTime", "2026-10-01", null)
  );
});
