import { expect, it } from "vitest";
import type { Data, Row } from "../src/core/domain/records";
import {
  buildSettlement,
  type SettlementInput,
} from "../src/features/statements/settlement";
import { settlementHtml } from "../src/features/statements/settlement-html";
const row = (id: string, data: Data): Row => ({ id, data });
function fixture(): SettlementInput {
  return {
    obligation: row("loan", {
      title: "Tuition loan",
      contactId: "alice",
      direction: "owedToMe",
      section: "owedToMe",
      type: "owedToMe",
      lifecycle: "active",
      financialStatus: "paid",
      currency: "PHP",
      originalAmountMinor: 10000,
      totalPaidMinor: 10000,
      remainingMinor: 0,
    }),
    contact: row("alice", { name: "Alice", email: "private@example.com" }),
    instances: [],
    payments: [
      row("p1", {
        obligationId: "loan",
        currency: "PHP",
        amountMinor: 4000,
        direction: "owedToMe",
        entryType: "payment",
        provenance: "manual",
        paymentDate: "2026-01-01",
        notes: "private-note",
      }),
      row("p2", {
        obligationId: "loan",
        currency: "PHP",
        amountMinor: 6000,
        direction: "owedToMe",
        entryType: "payment",
        provenance: "manual",
        paymentDate: "2026-02-01",
      }),
    ],
    evidence: [],
    issuedBy: "Jess",
    timezone: "Asia/Manila",
    generatedAt: "2026-10-15T12:00:00Z",
  };
}
it("confirms the actual parties, net total, settlement date and zero balance", () => {
  const result = buildSettlement(fixture());
  expect(result).toMatchObject({
    lender: "Jess",
    borrower: "Alice",
    paidMinor: 10000,
    remainingMinor: 0,
    settlementDate: "2026-02-01",
    paymentCount: 2,
  });
  const f = fixture();
  f.obligation.data.direction = "owedByMe";
  f.obligation.data.section = "iOwe";
  f.obligation.data.type = "owedByMe";
  f.payments.forEach((p) => (p.data.direction = "owedByMe"));
  expect(buildSettlement(f)).toMatchObject({
    lender: "Alice",
    borrower: "Jess",
  });
});
it("uses effective payments after a reversal and corrected repayment", () => {
  const f = fixture();
  f.payments[1].data.paymentDate = "2026-05-01";
  f.payments.push(
    row("r1", {
      ...f.payments[1].data,
      entryType: "reversal",
      reversesPaymentId: "p2",
    }),
    row("p3", { ...f.payments[1].data, paymentDate: "2026-03-01" }),
  );
  expect(buildSettlement(f)).toMatchObject({
    settlementDate: "2026-03-01",
    paidMinor: 10000,
    paymentCount: 2,
  });
});
it("rejects unpaid, cancelled, unconfirmed, future and inconsistent payment history", () => {
  for (const change of [
    (f: SettlementInput) => {
      f.obligation.data.remainingMinor = 1;
    },
    (f: SettlementInput) => {
      f.obligation.data.lifecycle = "cancelled";
    },
    (f: SettlementInput) => {
      f.payments.pop();
    },
    (f: SettlementInput) => {
      f.payments[0].data.provenance = "assumedAutomatic";
    },
    (f: SettlementInput) => {
      f.payments[0].data.paymentDate = "2090-01-01";
    },
    (f: SettlementInput) => {
      f.obligation.data.type = "recurringDue";
    },
    (f: SettlementInput) => {
      f.obligation.data.type = "installment";
    },
  ]) {
    const f = fixture();
    change(f);
    expect(() => buildSettlement(f)).toThrow();
  }
});
it("supports fully paid installments and rejects missing periods", () => {
  const f = fixture();
  f.obligation.data.type = "installment";
  f.obligation.data.installmentInstanceIds = ["a", "b"];
  f.instances = ["a", "b"].map((id) =>
    row(id, {
      obligationId: "loan",
      currency: "PHP",
      amountMinor: 5000,
      totalPaidMinor: 5000,
      remainingMinor: 0,
    }),
  );
  expect(buildSettlement(f).paidMinor).toBe(10000);
  f.instances.pop();
  expect(() => buildSettlement(f)).toThrow(/schedule/);
});
it("prints saved interest breakdown, escapes text and excludes private data", () => {
  const f = fixture();
  f.obligation.data.title = '<img src=x onerror="alert(1)">';
  f.obligation.data.interestInfo = {
    calculationVersion: 2,
    principalMinor: 9000,
    interestMinor: 1000,
    totalMinor: 10000,
    charge: { kind: "fixedAmount", amountMinor: 1000 },
    ratePeriod: { kind: "oneTime" },
    method: { kind: "simple" },
    rounding: "halfUp",
    originationDate: "2026-01-01",
    dueDate: "2026-02-01",
    agreementNotes: "private-interest-note",
  };
  const html = settlementHtml(buildSettlement(f));
  expect(html).toContain("Paid-in-full confirmation");
  expect(html).toContain("₱90.00");
  expect(html).toContain("₱10.00");
  expect(html).toContain("₱0.00");
  expect(html).toContain("&lt;img");
  expect(html).not.toContain("<img src=x");
  expect(html).not.toContain("private-");
  expect(html).not.toContain("private@example.com");
});
it("labels unsaved party names without fabricating a person", () => {
  const f = fixture();
  f.contact = null;
  f.obligation.data.contactId = null;
  f.issuedBy = "";
  expect(buildSettlement(f)).toMatchObject({
    lender: "Name not recorded",
    borrower: "Name not recorded",
  });
});

it("labels an existing nameless contact instead of printing Untitled as a party", () => {
  const f = fixture();
  f.contact!.data = { email: "private@example.com" };
  expect(buildSettlement(f).borrower).toBe("Name not recorded");
});
