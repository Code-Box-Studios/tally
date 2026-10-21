import assert from "node:assert/strict";
import {
  createInstallment,
  editInstallment,
} from "../../functions/tally-api/obligations/installment_service.ts";
import { recordInstallmentPayment } from "../../functions/tally-api/payments/payment_service.ts";
import { HttpsError } from "../../functions/tally-api/shared/errors.ts";
import type {
  CommandDatabase,
  Mutation,
} from "../../functions/tally-api/shared/database.ts";
import type { RecordData } from "../../functions/tally-api/shared/runtime.ts";

const owner = "owner";
const command = (commandId: string, payload: unknown) => ({
  commandId,
  expectedOwnerUid: owner,
  payload,
});
const loan = {
  title: "Alex's phone",
  description: "",
  notes: "",
  direction: "owedByMe",
  currency: "PHP",
  amountMinor: 10000,
  originationDate: "2020-01-01",
  dueDate: "2020-03-01",
  contactId: null,
  categoryId: "test",
  paymentSourceId: null,
  interestInfo: null,
  installments: [
    { amountMinor: 5000, dueDate: "2020-02-01" },
    { amountMinor: 5000, dueDate: "2020-03-01" },
  ],
  repayment: { contactId: "alex", accountId: "card" },
};

function fixture() {
  const audit = { userId: owner, schemaVersion: 1 };
  const records = new Map<string, RecordData>([
    ["ledgerState/current", { ...audit, revision: 1 }],
    ["categories/test", { ...audit, active: true, name: "Test" }],
    ["contacts/alex", {
      ...audit,
      kind: "person",
      displayName: "Alex",
      archived: false,
    }],
    ["paymentSources/card", {
      ...audit,
      name: "BPI",
      type: "creditCard",
      lastFour: "1234",
      active: true,
    }],
  ]);
  const receipts = new Map<string, RecordData>();
  let version = 1;
  const commits: Mutation[][] = [];
  const db = {
    profile: async () => ({
      data: { ...audit, timezone: "Asia/Manila", revision: 1 },
      version,
    }),
    receipt: async (_uid: string, id: string) => receipts.get(id) ?? null,
    read: async (_uid: string, collection: string, id: string) =>
      records.get(`${collection}/${id}`) ?? null,
    commit: async (
      _uid: string,
      id: string,
      type: string,
      hash: string,
      expected: number,
      mutations: Mutation[],
      result: unknown,
    ) => {
      assert.equal(expected, version);
      assert.ok(
        mutations.length <= 500,
        "One atomic command stays within the SQL mutation limit",
      );
      const keys = mutations.map((m) => `${m.collection}/${m.id}`);
      assert.equal(
        new Set(keys).size,
        keys.length,
        "No duplicate writes within the pair",
      );
      for (const mutation of mutations) {
        const key = `${mutation.collection}/${mutation.id}`;
        if (mutation.kind === "create") assert.ok(!records.has(key));
        records.set(key, { ...audit, ...records.get(key), ...mutation.data });
      }
      commits.push(mutations);
      version++;
      receipts.set(id, { commandType: type, payloadHash: hash, result });
      return result;
    },
  } as unknown as CommandDatabase;
  return { db, records, commits };
}

Deno.test("assigned installments create both schedules atomically and retry without duplicates", async () => {
  const { db, records, commits } = fixture();
  const input = command("create", loan);
  const result: RecordData = await createInstallment(owner, input, db);
  const provider = records.get(`obligations/${result.obligationId}`)!;
  const repayment = records.get(
    `obligations/${result.repayment.obligationId}`,
  )!;
  assert.equal(commits.length, 1);
  assert.equal(provider.direction, "owedByMe");
  assert.equal(provider.contactId, null);
  assert.equal(provider.installmentRole, "provider");
  assert.equal(provider.linkedObligationId, repayment.obligationId);
  assert.equal(repayment.direction, "owedToMe");
  assert.equal(repayment.contactId, "alex");
  assert.equal(repayment.installmentRole, "repayment");
  assert.equal(repayment.linkedObligationId, provider.obligationId);
  for (const parent of [provider, repayment]) {
    assert.equal(parent.installmentAccountId, "card");
    assert.equal(parent.installmentAccountSnapshot.name, "BPI");
    assert.equal(parent.remainingMinor, 10000);
    // The account financing the purchase is not the source of a repayment.
    assert.equal(parent.paymentSourceId, null);
    assert.deepEqual(
      parent.installmentInstanceIds.map((id: string) => {
        const row = records.get(`obligationInstances/${id}`)!;
        assert.equal(row.contactId, parent.contactId);
        return [row.amountMinor, row.dueDate];
      }),
      [[5000, "2020-02-01"], [5000, "2020-03-01"]],
    );
  }
  assert.deepEqual(await createInstallment(owner, input, db), result);
  assert.equal(commits.length, 1);
  assert.equal(
    [...records.keys()].filter((key) => key.startsWith("obligations/")).length,
    2,
  );
});

Deno.test("provider payments and repayments change only their own balance", async () => {
  const { db, records } = fixture();
  const result: RecordData = await createInstallment(
    owner,
    command("create", loan),
    db,
  );
  const payment = {
    currency: "PHP",
    paymentDate: "2020-01-02",
    paymentSourceId: null,
    paymentMethod: "cash",
    notes: "",
    explicitAllocations: null,
  };
  await recordInstallmentPayment(
    owner,
    command("provider-payment", {
      ...payment,
      obligationId: result.obligationId,
      amountMinor: 2500,
    }),
    db,
  );
  assert.equal(
    records.get(`obligations/${result.obligationId}`)!.remainingMinor,
    7500,
  );
  assert.equal(
    records.get(`obligations/${result.repayment.obligationId}`)!.remainingMinor,
    10000,
  );
  await recordInstallmentPayment(
    owner,
    command("repayment", {
      ...payment,
      obligationId: result.repayment.obligationId,
      amountMinor: 1000,
    }),
    db,
  );
  assert.equal(
    records.get(`obligations/${result.obligationId}`)!.remainingMinor,
    7500,
  );
  assert.equal(
    records.get(`obligations/${result.repayment.obligationId}`)!.remainingMinor,
    9000,
  );
});

for (
  const invalidReference of [
    "foreign-contact",
    "archived-contact",
    "missing-account",
    "inactive-account",
    "foreign-account",
  ]
) {
  Deno.test(`assigned installments reject ${invalidReference} before saving either balance`, async () => {
    const { db, records, commits } = fixture();
    if (invalidReference === "foreign-contact") {
      records.get("contacts/alex")!.userId = "another-owner";
    }
    if (invalidReference === "archived-contact") {
      records.get("contacts/alex")!.archived = true;
    }
    if (invalidReference === "missing-account") {
      records.delete("paymentSources/card");
    }
    if (invalidReference === "inactive-account") {
      records.get("paymentSources/card")!.active = false;
    }
    if (invalidReference === "foreign-account") {
      records.get("paymentSources/card")!.userId = "another-owner";
    }
    await assert.rejects(
      () => createInstallment(owner, command("bad", loan), db),
      { code: "failed-precondition" },
    );
    assert.equal(commits.length, 0);
  });
}

Deno.test("linked installments keep the assigned person and direction when edited", async () => {
  const { db } = fixture();
  const result: RecordData = await createInstallment(
    owner,
    command("create", loan),
    db,
  );
  const { repayment: _repayment, ...terms } = loan;
  await assert.rejects(() =>
    editInstallment(
      owner,
      command("reassign", {
        ...terms,
        obligationId: result.repayment.obligationId,
        expectedRevision: 1,
        direction: "owedToMe",
        contactId: null,
      }),
      db,
    ), HttpsError);
  await assert.rejects(() =>
    editInstallment(
      owner,
      command("redirect", {
        ...terms,
        obligationId: result.obligationId,
        expectedRevision: 1,
        direction: "owedToMe",
      }),
      db,
    ), HttpsError);
});

Deno.test("the maximum 120-installment pair fits one database commit", async () => {
  const { db, commits } = fixture();
  const installments = Array.from(
    { length: 120 },
    () => ({ amountMinor: 100, dueDate: "2020-03-01" }),
  );
  await createInstallment(
    owner,
    command("maximum", { ...loan, amountMinor: 12000, installments }),
    db,
  );
  assert.equal(commits.length, 1);
});
