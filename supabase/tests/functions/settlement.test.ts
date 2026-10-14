import assert from "node:assert/strict";
import type { CommandDatabase } from "../../functions/tally-api/shared/database.ts";
import type { RecordData } from "../../functions/tally-api/shared/runtime.ts";
import { getSettlementSnapshot } from "../../functions/tally-api/statements/settlement.ts";

function fixture() {
  const audit = { userId: "owner", schemaVersion: 1 };
  const parent: RecordData = {
    ...audit,
    obligationId: "loan",
    type: "owedToMe",
    direction: "owedToMe",
    section: "owedToMe",
    lifecycle: "active",
    currency: "PHP",
    originationDate: "2026-01-01",
    originalAmountMinor: 10000,
    totalPaidMinor: 10000,
    remainingMinor: 0,
    financialStatus: "paid",
    singleInstanceId: "period",
    contactId: "alice",
  };
  const period: RecordData = {
    ...audit,
    instanceId: "period",
    obligationId: "loan",
    currency: "PHP",
    direction: "owedToMe",
    dueDate: "2026-02-01",
    amountState: "known",
    amountMinor: 10000,
    totalPaidMinor: 10000,
    remainingMinor: 0,
    financialStatus: "paid",
    closed: true,
  };
  const payment: RecordData = {
    ...audit,
    paymentId: "payment",
    obligationId: "loan",
    obligationInstanceId: "period",
    currency: "PHP",
    direction: "owedToMe",
    amountMinor: 10000,
    allocations: [{ instanceId: "period", amountMinor: 10000 }],
    paymentDate: "2026-02-01",
    provenance: "manual",
    entryType: "payment",
    reversesPaymentId: null,
  };
  const data: Record<string, RecordData[]> = {
    obligations: [parent],
    contacts: [{ ...audit, contactId: "alice", name: "Alice" }],
    obligationInstances: [period],
    payments: [payment],
    paymentEvidence: [],
  };
  let version = 1;
  const db = {
    profile: async (uid: string) => {
      assert.equal(uid, "owner");
      return {
        data: { displayName: "Jess", timezone: "Asia/Manila" },
        version,
      };
    },
    read: async (uid: string, collection: string, id: string) => {
      assert.equal(uid, "owner");
      return data[collection]?.find((r) =>
        r.obligationId === id || r.contactId === id
      ) ?? null;
    },
    scan: async (uid: string, collection: string) => {
      assert.equal(uid, "owner");
      return data[collection] ?? [];
    },
  } as unknown as CommandDatabase;
  return { db, data, parent, period, payment, change: () => version++ };
}
Deno.test("settlement snapshot is owner scoped and read only", async () => {
  const { db, data } = fixture();
  data.payments.push({
    ...data.payments[0],
    paymentId: "other",
    obligationId: "other",
  });
  const before = JSON.stringify(data);
  const result = await getSettlementSnapshot(
    "owner",
    { obligationId: "loan" },
    db,
  );
  assert.equal(result.obligation.id, "loan");
  assert.equal(result.payments.length, 1);
  assert.equal(result.contact?.data.name, "Alice");
  assert.equal(before, JSON.stringify(data));
  await assert.rejects(
    getSettlementSnapshot("owner", { obligationId: "another-owner-loan" }, db),
    /unavailable/,
  );
  await assert.rejects(
    getSettlementSnapshot(
      "owner",
      { obligationId: "loan", ownerId: "someone" },
      db,
    ),
  );
});
Deno.test("settlement rejects unpaid, cancelled, recurring and incomplete ledgers", async () => {
  for (
    const mutation of [
      (f: ReturnType<typeof fixture>) => {
        f.parent.remainingMinor = 100;
      },
      (f: ReturnType<typeof fixture>) => {
        f.parent.lifecycle = "cancelled";
      },
      (f: ReturnType<typeof fixture>) => {
        f.parent.type = "recurringDue";
      },
      (f: ReturnType<typeof fixture>) => {
        f.data.payments = [];
      },
      (f: ReturnType<typeof fixture>) => {
        f.data.obligationInstances = [];
      },
      (f: ReturnType<typeof fixture>) => {
        f.payment.provenance = "assumedAutomatic";
      },
      (f: ReturnType<typeof fixture>) => {
        f.payment.userId = "other";
      },
    ]
  ) {
    const f = fixture();
    mutation(f);
    await assert.rejects(
      getSettlementSnapshot("owner", { obligationId: "loan" }, f.db),
    );
  }
});
Deno.test("settlement rejects a mixed snapshot after a concurrent owner command", async () => {
  const f = fixture();
  const scan = f.db.scan.bind(f.db);
  f.db.scan = async (...args) => {
    f.change();
    return await scan(...args);
  };
  await assert.rejects(
    getSettlementSnapshot("owner", { obligationId: "loan" }, f.db),
    /changed/,
  );
});
