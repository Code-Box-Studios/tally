import assert from "node:assert/strict";
import { createInstallment } from "../../functions/tally-api/obligations/installment_service.ts";
import { correctPayment } from "../../functions/tally-api/payments/corrections.ts";
import { foldFinancialLedger } from "../../functions/tally-api/payments/ledger.ts";
import { recordInstallmentPayment } from "../../functions/tally-api/payments/payment_service.ts";
import type {
  CommandDatabase,
  Mutation,
} from "../../functions/tally-api/shared/database.ts";
import type { RecordData } from "../../functions/tally-api/shared/runtime.ts";

const owner = "correction-owner";
const audit = { userId: owner, schemaVersion: 1 };
const terms = {
  amountMinor: 10000,
  paymentDate: "2020-01-02",
  paymentSourceId: null,
  paymentMethod: "cash",
  notes: "",
};
const command = (commandId: string, payload: unknown) => ({
  commandId,
  expectedOwnerUid: owner,
  payload,
});

async function history() {
  const records = new Map<string, RecordData>([
    ["ledgerState/current", { ...audit, revision: 1 }],
    ["categories/test", { ...audit, active: true, name: "Test" }],
  ]);
  const db = {
    profile: async () => ({
      data: { ...audit, timezone: "Asia/Manila", accountStatus: "active" },
      version: 1,
    }),
    receipt: async () => null,
    read: async (_owner: string, collection: string, id: string) =>
      records.get(`${collection}/${id}`) ?? null,
    commit: async (
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
      return result;
    },
  } as unknown as CommandDatabase;
  const created = await createInstallment(
    owner,
    command("create", {
      title: "Laptop",
      description: "",
      notes: "",
      direction: "owedByMe",
      currency: "PHP",
      amountMinor: 30000,
      originationDate: "2020-01-01",
      dueDate: "2020-04-01",
      contactId: null,
      categoryId: "test",
      paymentSourceId: null,
      interestInfo: null,
      installments: ["2020-02-01", "2020-03-01", "2020-04-01"].map(
        (dueDate) => ({ amountMinor: 10000, dueDate }),
      ),
    }),
    db,
  );
  const rows = (collection: string) =>
    [...records].filter(([key]) => key.startsWith(`${collection}/`)).map((
      [, row],
    ) => row);
  const ledger = () =>
    foldFinancialLedger({
      obligations: rows("obligations"),
      instances: rows("obligationInstances"),
      payments: rows("payments"),
    }, owner);
  return { db, records, created, ledger };
}

for (
  const [name, amounts] of [
    ["one chosen later period", [0, 0, 10000]],
    ["multiple chosen periods", [3000, 0, 7000]],
  ] as const
) {
  Deno.test(`a date-only correction preserves ${name} and reconciles immutable history`, async () => {
    const { db, records, created, ledger } = await history();
    const allocations = created.obligationInstanceIds.flatMap((
      instanceId,
      index,
    ) => amounts[index] ? [{ instanceId, amountMinor: amounts[index] }] : []);
    const paid = await recordInstallmentPayment(
      owner,
      command("pay", {
        ...terms,
        obligationId: created.obligationId,
        currency: "PHP",
        explicitAllocations: allocations,
      }),
      db,
    );
    const original = structuredClone(
      records.get(`payments/${paid.paymentId}`)!,
    );
    const corrected = await correctPayment(
      owner,
      command("correct-date", {
        paymentId: paid.paymentId,
        expectedObligationRevision: paid.obligationRevision,
        reason: "Correct the payment date",
        replacement: { ...terms, paymentDate: "2020-01-03" },
      }),
      db,
    );
    assert.deepEqual(records.get(`payments/${paid.paymentId}`), original);
    assert.deepEqual(
      records.get(`payments/${corrected.reversalId}`)!.allocations,
      allocations,
    );
    const replacement = records.get(`payments/${corrected.replacementId}`)!;
    assert.deepEqual(replacement.allocations, allocations);
    assert.equal(replacement.paymentDate, "2020-01-03");
    const folded = ledger();
    assert.deepEqual(
      created.obligationInstanceIds.map((id) =>
        folded.balances.get(id)!.totalPaidMinor
      ),
      amounts,
    );
    assert.deepEqual(folded.parentBalances.get(created.obligationId), {
      totalPaidMinor: 10000,
      remainingMinor: 20000,
    });
    assert.deepEqual(folded.effectivePayments.map((p) => p.paymentId), [
      corrected.replacementId,
    ]);
  });
}

Deno.test("an amount-changing installment correction keeps oldest-first allocation", async () => {
  const { db, created, ledger } = await history();
  const paid = await recordInstallmentPayment(
    owner,
    command("pay", {
      ...terms,
      obligationId: created.obligationId,
      currency: "PHP",
      explicitAllocations: [{
        instanceId: created.obligationInstanceIds[2],
        amountMinor: 10000,
      }],
    }),
    db,
  );
  await correctPayment(
    owner,
    command("correct-amount", {
      paymentId: paid.paymentId,
      reason: "Correct amount",
      replacement: { ...terms, amountMinor: 5000 },
    }),
    db,
  );
  const folded = ledger();
  assert.deepEqual(
    created.obligationInstanceIds.map((id) =>
      folded.balances.get(id)!.totalPaidMinor
    ),
    [5000, 0, 0],
  );
  assert.deepEqual(folded.parentBalances.get(created.obligationId), {
    totalPaidMinor: 5000,
    remainingMinor: 25000,
  });
});
