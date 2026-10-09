const test = Deno.test;
import assert from "node:assert/strict";
import { calculateProjection } from "../../functions/tally-api/dashboard/projection.ts";
import { occurrenceInstanceId } from "../../functions/tally-api/shared/occurrence_id.ts";
import {
  audit,
  context,
  finite,
  input,
  owner,
  payment,
  period,
} from "./support/projection_fixtures.ts";

test("dashboard and contact positions keep currencies and independent debts separate", () => {
  const borrowed = finite("borrowed", 100_000, { contactId: "john" });
  const lent = finite("lent", 50_000, {
    direction: "owedToMe",
    section: "owedToMe",
    contactId: "john",
  });
  const usd = finite("usd", 500, { currency: "USD" });
  const projected = calculateProjection(
    input(
      [borrowed, lent, usd],
      [period(borrowed), period(lent), period(usd)],
      [],
      [{ ...audit, contactId: "john" }],
    ),
    context,
  );
  assert.equal(projected.currencies.PHP.youOweMinor, 100_000);
  assert.equal(projected.currencies.PHP.owedToYouMinor, 50_000);
  assert.equal(projected.currencies.PHP.netPositionMinor, -50_000);
  assert.equal(projected.currencies.USD.youOweMinor, 500);
  assert.equal(projected.contacts.john!.currencies.PHP.youOweMinor, 100_000);
  assert.equal(projected.contacts.john!.currencies.PHP.owedToYouMinor, 50_000);
});
test("installment principal is counted once and month remaining is independent of payment month", () => {
  const id = "installment";
  const ids = ["i:0001", "i:0002", "i:0003"].map((key) =>
    occurrenceInstanceId(id, key)
  );
  const parent = finite(id, 100_000, {
    type: "installment",
    singleInstanceId: null,
    installmentInstanceIds: ids,
    totalPaidMinor: 30_000,
    remainingMinor: 70_000,
  });
  const instances = ids.map((instanceId, index) =>
    period(parent, {
      instanceId,
      amountMinor: index === 2 ? 40_000 : 30_000,
      totalPaidMinor: index === 0 ? 30_000 : 0,
      remainingMinor: index === 0 ? 0 : index === 2 ? 40_000 : 30_000,
      closed: index === 0,
      dueDate: `2026-${index === 0 ? "10" : index === 1 ? "11" : "12"}-15`,
    })
  );
  const entry = payment(parent, 30_000, {
    obligationInstanceId: ids[0],
    allocations: [{ instanceId: ids[0], amountMinor: 30_000 }],
    paymentDate: "2026-09-30",
  });
  const bucket =
    calculateProjection(input([parent], instances, [entry]), context).currencies
      .PHP;
  assert.equal(bucket.youOweMinor, 70_000);
  assert.equal(bucket.month.outgoing.scheduledMinor, 30_000);
  assert.equal(bucket.month.outgoing.remainingMinor, 0);
  assert.equal(bucket.month.outgoing.paidMinor, 0);
});
test("a December reversal changes October effective paid and replacement uses its own financial date", () => {
  const parent = finite("corrected", 100_000, {
    totalPaidMinor: 20_000,
    remainingMinor: 80_000,
  });
  const original = payment(parent, 30_000);
  const reversal = {
    ...original,
    paymentId: "reversal",
    entryType: "reversal",
    reversesPaymentId: original.paymentId,
    recordedAt: new Date("2026-12-01T00:00:00Z"),
  };
  const replacement = payment(parent, 20_000, {
    paymentId: "replacement",
    paymentDate: "2026-11-01",
  });
  const records = input([parent], [period(parent)], [
    original,
    reversal,
    replacement,
  ]);
  assert.equal(
    calculateProjection(records, context).currencies.PHP.month.outgoing
      .paidMinor,
    0,
  );
  assert.equal(
    calculateProjection(records, {
      ...context,
      yearMonth: "2026-11",
      today: "2026-11-04",
      now: new Date("2026-11-04T04:00:00Z"),
    }).currencies.PHP.month.outgoing.paidMinor,
    20_000,
  );
});
test("cancelled instances preserve paid history while leaving all actionable totals", () => {
  const parent = finite("cancelled", 100_000, {
    lifecycle: "cancelled",
    totalPaidMinor: 30_000,
    remainingMinor: 70_000,
  });
  const bucket = calculateProjection(
    input([parent], [
      period(parent, { financialStatus: "cancelled", closed: true }),
    ], [payment(parent)]),
    context,
  ).currencies.PHP;
  assert.equal(bucket.youOweMinor, 0);
  assert.equal(bucket.month.outgoing.scheduledMinor, 0);
  assert.equal(bucket.month.outgoing.paidMinor, 30_000);
});
test("variable amounts remain unknown and deduction evidence subtotals remain separate", () => {
  const parent = finite("recurring", 100_000, {
    type: "recurringDue",
    section: "monthlyDues",
    singleInstanceId: null,
    originalAmountMinor: null,
    totalPaidMinor: null,
    remainingMinor: null,
  });
  const unknown = period(parent, {
    instanceId: "unknown",
    amountState: "unknown",
    amountMinor: null,
    totalPaidMinor: 0,
    remainingMinor: null,
    dueDate: "2026-10-04",
  });
  const assumed = period(parent, {
    instanceId: "assumed",
    amountMinor: 1000,
    totalPaidMinor: 1000,
    remainingMinor: 0,
    closed: true,
    financialStatus: "paid",
  });
  const confirmed = period(parent, {
    instanceId: "confirmed",
    amountMinor: 2000,
    totalPaidMinor: 2000,
    remainingMinor: 0,
    closed: true,
    financialStatus: "paid",
  });
  const entries = [
    payment(parent, 1000, {
      paymentId: "auto-assumed",
      obligationInstanceId: "assumed",
      allocations: [{ instanceId: "assumed", amountMinor: 1000 }],
      provenance: "assumedAutomatic",
    }),
    payment(parent, 2000, {
      paymentId: "auto-confirmed",
      obligationInstanceId: "confirmed",
      allocations: [{ instanceId: "confirmed", amountMinor: 2000 }],
      provenance: "confirmedAutomatic",
    }),
  ];
  const bucket = calculateProjection(
    input([parent], [unknown, assumed, confirmed], entries),
    context,
  ).currencies.PHP;
  assert.equal(bucket.month.outgoing.unknownAmountCount, 1);
  assert.equal(bucket.attention.dueToday.outgoing.unknownAmountCount, 1);
  assert.equal(bucket.month.outgoing.paidMinor, 3000);
  assert.equal(bucket.month.outgoing.assumedPaidMinor, 1000);
  assert.equal(bucket.month.outgoing.confirmedPaidMinor, 2000);
});
test("overdue follows each instance timezone and not a changed profile timezone", () => {
  const hawaii = finite("hawaii", 100, { timezone: "Pacific/Honolulu" });
  const manila = finite("manila", 200);
  const now = new Date("2026-10-04T00:01:00Z");
  const bucket = calculateProjection(
    input([hawaii, manila], [
      period(hawaii, { dueDate: "2026-10-03" }),
      period(manila, { dueDate: "2026-10-03" }),
    ]),
    { ...context, now },
  ).currencies.PHP;
  assert.equal(bucket.attention.dueToday.outgoing.amountMinor, 100);
  assert.equal(bucket.attention.overdue.outgoing.amountMinor, 200);
});
test("invalid history, foreign ownership and overflow fail instead of publishing false totals", () => {
  const parent = finite("debt", 100_000, {
    totalPaidMinor: 30_000,
    remainingMinor: 70_000,
  });
  const original = payment(parent);
  assert.throws(
    () => calculateProjection(input([parent], [period(parent)], []), context),
    { code: "failed-precondition" },
  );
  assert.throws(
    () =>
      calculateProjection(
        input([parent], [period(parent)], [{ ...original, userId: "foreign" }]),
        context,
      ),
    { code: "failed-precondition" },
  );
  assert.throws(
    () =>
      calculateProjection(
        input([parent], [period(parent)], [original, {
          ...original,
          paymentId: "bad-reversal",
          entryType: "reversal",
          reversesPaymentId: original.paymentId,
          amountMinor: 20_000,
        }]),
        context,
      ),
    { code: "failed-precondition" },
  );
  const parents = Array.from(
    { length: 9008 },
    (_, index) => finite(`overflow-${index}`, 1_000_000_000_000),
  );
  assert.throws(
    () =>
      calculateProjection(
        input(
          parents,
          parents.map((parent) => period(parent)),
        ),
        context,
      ),
    { code: "failed-precondition" },
  );
  assert.throws(
    () =>
      calculateProjection(
        input([{ ...finite("foreign"), userId: "another" }], [
          period(finite("foreign")),
        ]),
        { ...context, uid: owner },
      ),
    { code: "failed-precondition" },
  );
});

test("finite type/direction and cancellation must agree across the whole schedule", () => {
  const mismatched = finite("mismatched", 100, {
    type: "owedToMe",
    direction: "owedByMe",
  });
  assert.throws(
    () =>
      calculateProjection(input([mismatched], [period(mismatched)]), context),
    { code: "failed-precondition" },
  );
  const debt = finite("skipped", 100);
  assert.throws(
    () =>
      calculateProjection(
        input([debt], [
          period(debt, { financialStatus: "skipped", closed: true }),
        ]),
        context,
      ),
    { code: "failed-precondition" },
  );
  assert.throws(
    () =>
      calculateProjection(
        input([debt], [
          period(debt, { financialStatus: "cancelled", closed: true }),
        ]),
        context,
      ),
    { code: "failed-precondition" },
  );
});
test("a reversed recurring payment can leave an unpaid skipped period without erasing history", () => {
  const parent = finite("skip-after-reversal", 1000, {
    type: "recurringDue",
    section: "monthlyDues",
    singleInstanceId: null,
    originalAmountMinor: null,
    totalPaidMinor: null,
    remainingMinor: null,
  });
  const instance = period(parent, {
    instanceId: "skipped-period",
    amountMinor: 1000,
    totalPaidMinor: 0,
    remainingMinor: 1000,
    financialStatus: "skipped",
    closed: true,
  });
  const original = payment(parent, 1000, {
    obligationInstanceId: "skipped-period",
    allocations: [{ instanceId: "skipped-period", amountMinor: 1000 }],
  });
  const reversal = {
    ...original,
    paymentId: "skip-reversal",
    entryType: "reversal",
    reversesPaymentId: original.paymentId,
  };
  const bucket = calculateProjection(
    input([parent], [instance], [original, reversal]),
    context,
  ).currencies.PHP;
  assert.equal(bucket.month.outgoing.scheduledMinor, 0);
  assert.equal(bucket.month.outgoing.paidMinor, 0);
});
test("confirmation evidence upgrades display totals without rewriting assumed payment provenance", () => {
  const parent = finite("evidenced", 1000, {
    type: "recurringDue",
    section: "monthlyDues",
    singleInstanceId: null,
    originalAmountMinor: null,
    totalPaidMinor: null,
    remainingMinor: null,
  });
  const instance = period(parent, {
    instanceId: "evidenced-period",
    amountMinor: 1000,
    totalPaidMinor: 1000,
    remainingMinor: 0,
    closed: true,
    financialStatus: "paid",
  });
  const original = payment(parent, 1000, {
    paymentId: "evidenced-payment",
    obligationInstanceId: instance.instanceId,
    allocations: [{ instanceId: instance.instanceId, amountMinor: 1000 }],
    provenance: "assumedAutomatic",
  });
  const evidence = {
    ...audit,
    evidenceId: "proof",
    paymentId: original.paymentId,
    kind: "userConfirmed",
    actor: "user",
  };
  const records = {
    ...input([parent], [instance], [original]),
    paymentEvidence: [evidence],
  };
  const bucket = calculateProjection(records, context).currencies.PHP;
  assert.equal(bucket.month.outgoing.assumedPaidMinor, 0);
  assert.equal(bucket.month.outgoing.confirmedPaidMinor, 1000);
  assert.equal(original.provenance, "assumedAutomatic");
  const foreign = {
      ...records,
      paymentEvidence: [{ ...evidence, userId: "foreign" }],
    },
    missing = {
      ...records,
      paymentEvidence: [{ ...evidence, paymentId: "missing" }],
    };
  assert.throws(() => calculateProjection(foreign, context), {
    code: "failed-precondition",
  });
  assert.throws(() => calculateProjection(missing, context), {
    code: "failed-precondition",
  });
});
