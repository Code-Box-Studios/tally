import assert from "node:assert/strict";
import {
  calculateSimpleInterest,
  type CustomInterestOptions,
} from "../../functions/tally-api/obligations/interest_calculation.ts";
import * as interestEngine from "../../functions/tally-api/obligations/interest_calculation.ts";
import {
  editObligation,
  terms,
  validateObligationCreation,
} from "../../functions/tally-api/obligations/obligation_service.ts";
import { editInstallment } from "../../functions/tally-api/obligations/installment_service.ts";
import { occurrenceInstanceId } from "../../functions/tally-api/shared/occurrence_id.ts";
import type {
  CommandDatabase,
  Mutation,
} from "../../functions/tally-api/shared/database.ts";
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

const customOptions: CustomInterestOptions = {
  charge: { kind: "percentage", rateBasisPoints: 300 },
  ratePeriod: { kind: "days", days: 30 },
  method: { kind: "compound", intervalDays: 30 },
  rounding: "halfUp",
  originationDate: "2026-10-01",
  dueDate: "2026-11-30",
};
const calculateCustomInterest = interestEngine.calculateCustomInterest;
const custom = {
  calculationVersion: 2,
  principalMinor: 100000,
  ...customOptions,
  dayCount: 60,
  interestMinor: 6090,
  totalMinor: 106090,
  agreementNotes: "Agreed compound terms",
};

Deno.test("custom compound interest verifies exact cycles and partial final cycles", () => {
  const { agreementNotes: _notes, ...expected } = custom;
  assert.deepEqual(calculateCustomInterest(100000, customOptions), expected);
  assert.equal(
    calculateCustomInterest(100000, {
      ...customOptions,
      dueDate: "2026-12-05",
    }).interestMinor,
    6620,
  );
});

Deno.test("custom charges support cash, distinct compounding intervals and all final rounding modes", () => {
  assert.equal(
    calculateCustomInterest(100000, {
      ...customOptions,
      charge: { kind: "fixedAmount", amountMinor: 5000 },
      method: { kind: "simple" },
      dueDate: "2026-11-15",
    }).interestMinor,
    7500,
  );
  assert.equal(
    calculateCustomInterest(1000000, {
      ...customOptions,
      charge: { kind: "percentage", rateBasisPoints: 1200 },
      ratePeriod: { kind: "days", days: 365 },
      method: { kind: "compound", intervalDays: 1 },
      originationDate: "2026-01-01",
      dueDate: "2027-01-01",
    }).interestMinor,
    127475,
  );
  for (
    const [rounding, expected] of [["halfUp", 1], ["down", 0], [
      "up",
      1,
    ]] as const
  ) {
    assert.equal(
      calculateCustomInterest(1, {
        ...customOptions,
        charge: { kind: "percentage", rateBasisPoints: 5000 },
        ratePeriod: { kind: "oneTime" },
        method: { kind: "simple" },
        dueDate: null,
        rounding,
      }).interestMinor,
      expected,
    );
  }
});

Deno.test("the API validates every custom charge field and rejects unsupported versions", () => {
  const body = { ...loan(custom, 106090), dueDate: custom.dueDate };
  assert.deepEqual(validateObligationCreation(body).interestInfo, custom);
  for (
    const changed of [
      { ...custom, principalMinor: 110000 },
      { ...custom, interestMinor: 6091 },
      { ...custom, totalMinor: 106091 },
      { ...custom, dayCount: 61 },
      { ...custom, originationDate: "2026-09-30" },
      { ...custom, dueDate: "2026-12-01" },
      { ...custom, charge: { ...custom.charge, additionalFee: 1 } },
      { ...custom, method: { kind: "compound", intervalDays: 0 } },
      {
        ...custom,
        ratePeriod: { kind: "days", days: Number.MAX_SAFE_INTEGER },
      },
      { ...custom, rounding: "nearest" },
      { ...custom, calculationVersion: 3 },
    ]
  ) {
    assert.throws(
      () => validateObligationCreation({ ...body, interestInfo: changed }),
      {
        code: "invalid-argument",
      },
    );
  }
});

Deno.test("custom compound extremes are bounded and tiny long-term interest stays exact", () => {
  assert.throws(() =>
    calculateCustomInterest(100000, {
      ...customOptions,
      charge: { kind: "percentage", rateBasisPoints: 100000 },
      ratePeriod: { kind: "days", days: 1 },
      method: { kind: "compound", intervalDays: 1 },
      originationDate: "1900-01-01",
      dueDate: "2199-12-31",
    }), { code: "invalid-argument" });
  assert.equal(
    calculateCustomInterest(1, {
      ...customOptions,
      charge: { kind: "percentage", rateBasisPoints: 1 },
      ratePeriod: { kind: "days", days: 36500 },
      method: { kind: "compound", intervalDays: 1 },
      originationDate: "1900-01-01",
      dueDate: "2199-12-31",
      rounding: "up",
    }).interestMinor,
    1,
  );
});

Deno.test("custom interest rejects object rounding rules with an invalid-argument response", () => {
  assert.throws(() =>
    calculateCustomInterest(1, {
      ...customOptions,
      rounding: { toString: () => "up" },
    }), { code: "invalid-argument" });
});

const historyOwner = "interest-history-owner";
function historyDatabase(
  interestInfo: unknown,
  amountMinor: number,
  installment = false,
) {
  const body = { ...loan(interestInfo, amountMinor), dueDate: "2026-11-30" };
  const audit = { userId: historyOwner, schemaVersion: 1 };
  const ids = installment
    ? [1, 2].map((n) =>
      occurrenceInstanceId("history-loan", `i:${String(n).padStart(4, "0")}`)
    )
    : ["history-period"];
  const amounts = installment
    ? [Math.floor(amountMinor / 2), amountMinor - Math.floor(amountMinor / 2)]
    : [amountMinor];
  const records = new Map<string, Record<string, unknown>>([
    ["categories/default-personal-loan", {
      ...audit,
      active: true,
      name: "Loan",
    }],
    ["obligations/history-loan", {
      ...audit,
      ...body,
      obligationId: "history-loan",
      originalAmountMinor: amountMinor,
      remainingMinor: amountMinor - 1000,
      totalPaidMinor: 1000,
      lifecycle: "active",
      hasPaymentHistory: true,
      type: installment ? "installment" : "owedToMe",
      section: "owedToMe",
      singleInstanceId: installment ? null : ids[0],
      ...(installment ? { installmentInstanceIds: ids } : {}),
      timezone: "Asia/Manila",
      revision: 1,
    }],
  ]);
  const installments = ids.map((instanceId, index) => {
    const dueDate = installment && index === 0 ? "2026-10-31" : "2026-11-30";
    records.set(`obligationInstances/${instanceId}`, {
      ...audit,
      instanceId,
      obligationId: "history-loan",
      amountMinor: amounts[index],
      totalPaidMinor: index === 0 ? 1000 : 0,
      remainingMinor: amounts[index] - (index === 0 ? 1000 : 0),
      hasPaymentHistory: index === 0,
      amountState: "known",
      closed: false,
      dueDate,
      currency: "PHP",
      direction: "owedToMe",
      section: "owedToMe",
      timezone: "Asia/Manila",
      revision: 1,
      financialStatus: "partiallyPaid",
      occurrenceKey: installment
        ? `i:${String(index + 1).padStart(4, "0")}`
        : "one-time",
    });
    return { dueDate, amountMinor: amounts[index] };
  });
  const db = {
    profile: () =>
      Promise.resolve({
        data: {
          ...audit,
          revision: 1,
          timezone: "Asia/Manila",
          accountStatus: "active",
        },
        version: 1,
      }),
    receipt: () => Promise.resolve(null),
    read: (_owner: string, collection: string, id: string) =>
      Promise.resolve(
        collection === "ledgerState"
          ? { ...audit, revision: 1 }
          : records.get(`${collection}/${id}`) ?? null,
      ),
    commit: (
      _owner: string,
      _id: string,
      _type: string,
      _hash: string,
      _version: number,
      mutations: Mutation[],
      result: unknown,
    ) => {
      for (const mutation of mutations) {
        const key = `${mutation.collection}/${mutation.id}`;
        records.set(key, { ...audit, ...records.get(key), ...mutation.data });
      }
      return Promise.resolve(result);
    },
  } as unknown as CommandDatabase;
  const edit = (interest: unknown) => ({
    commandId: "edit-interest-history",
    expectedOwnerUid: historyOwner,
    payload: {
      ...body,
      interestInfo: interest,
      obligationId: "history-loan",
      expectedRevision: 1,
      ...(installment ? { installments } : {}),
    },
  });
  return { db, records, edit };
}

for (const installment of [false, true]) {
  const service = installment ? editInstallment : editObligation;
  const name = installment ? "installment" : "single loan";
  Deno.test(`${name} paid history rejects replacing computed terms despite an identical total`, async () => {
    const history = historyDatabase(custom, custom.totalMinor, installment);
    const replacement = {
      ...custom,
      principalMinor: 106090,
      charge: { kind: "fixedAmount", amountMinor: 0 },
      ratePeriod: { kind: "oneTime" },
      method: { kind: "simple" },
      interestMinor: 0,
    };
    await assert.rejects(
      () => service(historyOwner, history.edit(replacement), history.db),
      {
        code: "failed-precondition",
      },
    );
    assert.deepEqual(
      history.records.get("obligations/history-loan")!.interestInfo,
      custom,
    );
  });
  Deno.test(`${name} paid history allows agreement notes without changing computed terms`, async () => {
    const history = historyDatabase(custom, custom.totalMinor, installment);
    await service(
      historyOwner,
      history.edit({ ...custom, agreementNotes: "Updated notes" }),
      history.db,
    );
    assert.deepEqual(
      history.records.get("obligations/history-loan")!.interestInfo,
      { ...custom, agreementNotes: "Updated notes" },
    );
    assert.equal(
      history.records.get("obligations/history-loan")!.remainingMinor,
      105090,
    );
  });
  Deno.test(`${name} paid history preserves existing V1 charges and their version`, async () => {
    const old = { ...flat, dueDate: "2026-11-30", dayCount: 60 };
    const history = historyDatabase(old, old.totalMinor, installment);
    await service(
      historyOwner,
      history.edit({ ...old, agreementNotes: "Preserved" }),
      history.db,
    );
    assert.equal(
      (history.records.get("obligations/history-loan")!
        .interestInfo as typeof old).calculationVersion,
      1,
    );
    const replacement = {
      ...old,
      principalMinor: 105000,
      rateBasisPoints: 0,
      interestMinor: 0,
    };
    const second = historyDatabase(old, old.totalMinor, installment);
    await assert.rejects(
      () => service(historyOwner, second.edit(replacement), second.db),
      { code: "failed-precondition" },
    );
  });
}
