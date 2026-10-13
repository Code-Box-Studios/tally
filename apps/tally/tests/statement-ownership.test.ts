import { describe, expect, it } from "vitest";
import type { Data, Row } from "../src/core/domain/records";
import { buildStatement } from "../src/features/statements/statement";

const row = (id: string, data: Data): Row => ({ id, data });
const bill = row("bill", {
  title: "Internet",
  contactId: "bob",
  type: "recurringDue",
  section: "monthlyDues",
  currency: "PHP",
  lifecycle: "active",
  financialStatus: "active",
});
const period = (id: string, contactId: string | null, changes: Data = {}) =>
  row(id, {
    obligationId: "bill",
    contactId,
    currency: "PHP",
    amountMinor: 10000,
    totalPaidMinor: 2000,
    remainingMinor: 8000,
    dueDate: "2026-10-01",
    financialStatus: "partiallyPaid",
    ...changes,
  });
const payment = (id: string, contactId: string | null, changes: Data = {}) =>
  row(id, {
    obligationId: "bill",
    obligationInstanceId: "old",
    contactId,
    currency: "PHP",
    amountMinor: 2000,
    entryType: "payment",
    paymentDate: "2026-10-01",
    recordedAt: "2026-10-01T00:00:00Z",
    direction: "owedByMe",
    provenance: "manual",
    ...changes,
  });
function statement(
  contactId: string,
  instances: Row[],
  payments: Row[],
  obligations = [bill],
) {
  return buildStatement({
    contact: row(contactId, { name: contactId }),
    obligations,
    instances,
    payments,
    issuedBy: "Jess",
    timezone: "Asia/Manila",
    generatedAt: "2026-10-13T00:00:00Z",
    cached: false,
  });
}

describe("statement contact ownership", () => {
  it("keeps recurring balances and corrected payment history with each period's original contact", () => {
    const instances = [
      period("old", "alice"),
      period("new", "bob", {
        amountMinor: 4000,
        totalPaidMinor: 1000,
        remainingMinor: 3000,
      }),
    ];
    const payments = [
      payment("original", "alice", { amountMinor: 3000 }),
      payment("reversal", "alice", {
        amountMinor: 3000,
        entryType: "reversal",
        reversesPaymentId: "original",
        recordedAt: "2026-10-02T00:00:00Z",
      }),
      payment("replacement", "alice", {
        recordedAt: "2026-10-02T00:01:00Z",
      }),
      payment("bob-payment", "bob", {
        obligationInstanceId: "new",
        amountMinor: 1000,
      }),
    ];
    const alice = statement("alice", instances, payments);
    expect(alice.accounts).toHaveLength(1);
    expect(alice.accounts[0]).toMatchObject({
      paidMinor: 2000,
      remainingMinor: 8000,
    });
    expect(alice.accounts[0].periods.map((p) => p.id)).toEqual(["old"]);
    expect(alice.history.map((p) => p.signedAmountMinor)).toEqual([
      3000, -3000, 2000,
    ]);
    expect(alice.history[0].reversed).toBe(true);
    expect(alice.summaries[0].youOweMinor).toBe(8000);
    const bob = statement("bob", instances, payments);
    expect(bob.accounts[0]).toMatchObject({
      paidMinor: 1000,
      remainingMinor: 3000,
    });
    expect(bob.accounts[0].periods.map((p) => p.id)).toEqual(["new"]);
    expect(bob.history.map((p) => p.id)).toEqual(["bob-payment"]);
    expect(bob.summaries[0].youOweMinor).toBe(3000);
  });

  it("preserves future and unknown periods after contact cutover without counting skipped or unassigned bills", () => {
    const instances = [
      period("future", "alice", {
        totalPaidMinor: 0,
        remainingMinor: 10000,
        dueDate: "2026-12-01",
      }),
      period("unknown", "alice", {
        amountMinor: null,
        totalPaidMinor: 0,
        remainingMinor: null,
      }),
      period("skipped", "alice", {
        totalPaidMinor: 0,
        remainingMinor: 10000,
        financialStatus: "skipped",
      }),
      period("unassigned", null, { totalPaidMinor: 0, remainingMinor: 10000 }),
    ];
    const alice = statement(
      "alice",
      instances,
      [],
      [row("bill", { ...bill.data, lifecycle: "ended" })],
    );
    expect(alice.accounts[0].periods).toHaveLength(3);
    expect(alice.summaries[0]).toMatchObject({
      youOweMinor: 10000,
      unknownAmounts: 1,
    });
    const bob = statement("bob", instances, []);
    expect(bob.accounts[0].periods).toEqual([]);
    expect(bob.summaries[0].youOweMinor).toBe(0);
    const cancelled = statement(
      "alice",
      instances,
      [],
      [row("bill", { ...bill.data, lifecycle: "cancelled" })],
    );
    expect(cancelled.accounts[0].excluded).toBe(true);
    expect(cancelled.summaries[0]).toMatchObject({
      youOweMinor: 0,
      unknownAmounts: 0,
    });
  });

  it("uses a linked period's immutable contact when a legacy payment lacks its contact snapshot", () => {
    const legacy = payment("legacy", "alice");
    delete legacy.data.contactId;
    const alice = statement("alice", [period("old", "alice")], [legacy]);
    expect(alice.history.map((p) => p.id)).toEqual(["legacy"]);
    expect(alice.accounts[0].paidMinor).toBe(2000);
    expect(
      statement("bob", [period("old", "alice")], [legacy]).history,
    ).toEqual([]);
  });

  it("retains parent ownership for legacy records with no contact snapshots or period link", () => {
    const legacyPeriod = period("old", "bob");
    delete legacyPeriod.data.contactId;
    const legacyPayment = payment("legacy", "bob");
    delete legacyPayment.data.contactId;
    delete legacyPayment.data.obligationInstanceId;
    expect(
      statement("bob", [legacyPeriod], [legacyPayment]).summaries[0]
        .youOweMinor,
    ).toBe(8000);
  });

  it("refuses payments whose saved contact conflicts with their linked recurring period", () => {
    expect(() =>
      statement("alice", [period("old", "bob")], [payment("wrong", "alice")]),
    ).toThrow(/contact|history.*balance/i);
  });

  it("keeps finite debts scoped by their parent without counting installment periods twice", () => {
    const finite = row("bill", {
      ...bill.data,
      type: "installment",
      section: "iOwe",
      contactId: "alice",
      originalAmountMinor: 10000,
      totalPaidMinor: 2000,
      remainingMinor: 8000,
    });
    const result = statement(
      "alice",
      [period("old", "alice")],
      [payment("paid", "alice")],
      [finite],
    );
    expect(result.summaries[0].youOweMinor).toBe(8000);
    expect(result.accounts[0].periods).toEqual([
      expect.objectContaining({
        id: "old",
        paidMinor: 2000,
        remainingMinor: 8000,
      }),
    ]);
  });
});
