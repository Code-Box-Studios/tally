import { expect, it } from "vitest";
import type { Data, Row } from "../src/core/domain/records";
import { contactOverview } from "../src/features/people/contact-overview";
import { buildStatement } from "../src/features/statements/statement";

const row = (id: string, data: Data): Row => ({ id, data });
const loan = (id: string, data: Data = {}) =>
  row(id, {
    title: id,
    type: "loan",
    section: "iOwe",
    contactId: "alex",
    currency: "PHP",
    originalAmountMinor: 10000,
    remainingMinor: 10000,
    totalPaidMinor: 0,
    lifecycle: "active",
    ...data,
  });
const bill = (data: Data = {}) =>
  row("bill", {
    title: "Utility",
    type: "recurringDue",
    section: "monthlyDues",
    contactId: "bea",
    currency: "PHP",
    lifecycle: "paused",
    ...data,
  });
const period = (id: string, data: Data = {}) =>
  row(id, {
    obligationId: "bill",
    contactId: "alex",
    currency: "PHP",
    amountMinor: 7000,
    remainingMinor: 7000,
    totalPaidMinor: 0,
    dueDate: "2026-10-15",
    financialStatus: "pending",
    ...data,
  });

it("matches statement totals across directions, currencies, archives and recurring lifecycle states", () => {
  const obligations = [
    loan("loan"),
    loan("lent", { section: "owedToMe" }),
    loan("dollars", { currency: "USD" }),
    loan("archive", { archived: true }),
    loan("cancelled", { lifecycle: "cancelled" }),
    bill(),
    row("ended", { ...bill().data, contactId: "alex", lifecycle: "ended" }),
  ];
  const instances = [
    period("old"),
    period("unknown", { amountMinor: null, remainingMinor: null }),
    period("skipped", { financialStatus: "skipped" }),
    period("cancelled", { financialStatus: "cancelled" }),
    period("new", { contactId: "bea" }),
    period("ended-period", { obligationId: "ended" }),
  ];
  const overview = contactOverview("alex", obligations, instances);
  expect(overview.positions).toEqual({
    PHP: { owe: 24000, owed: 10000, unknownAmounts: 1 },
    USD: { owe: 10000, owed: 0, unknownAmounts: 0 },
  });
  const statement = buildStatement({
    contact: row("alex", { displayName: "Alex" }),
    obligations,
    instances,
    payments: [],
    issuedBy: "Jess",
    timezone: "Asia/Manila",
    generatedAt: "2026-10-14T00:00:00Z",
    cached: false,
  });
  for (const summary of statement.summaries)
    expect(overview.positions[summary.currency]).toEqual({
      owe: summary.youOweMinor,
      owed: summary.owedToYouMinor,
      unknownAmounts: summary.unknownAmounts,
    });
});

it("keeps explicit unassigned periods unassigned and falls back only for legacy missing snapshots", () => {
  const legacy = period("legacy");
  delete legacy.data.contactId;
  const instances = [
    period("old"),
    period("unassigned", { contactId: null }),
    legacy,
  ];
  expect(contactOverview("alex", [bill()], instances).positions.PHP.owe).toBe(
    7000,
  );
  expect(contactOverview("bea", [bill()], instances).positions.PHP.owe).toBe(
    7000,
  );
});

it("counts installment parent balance once and keeps recurring payment history with its saved contact", () => {
  const obligations = [loan("installment", { type: "installment" }), bill()];
  const instances = [
    period("first", {
      obligationId: "installment",
      amountMinor: 5000,
      remainingMinor: 5000,
    }),
    period("second", {
      obligationId: "installment",
      amountMinor: 5000,
      remainingMinor: 5000,
    }),
    period("old"),
  ];
  const payments = [
    row("payment", {
      obligationId: "bill",
      obligationInstanceId: "old",
      contactId: "alex",
      amountMinor: 2000,
      recordedAt: "2026-10-13T00:00:00Z",
    }),
  ];
  expect(
    contactOverview("alex", obligations, instances, payments).positions.PHP.owe,
  ).toBe(17000);
  expect(
    contactOverview("alex", obligations, instances, payments).history.map(
      (entry) => entry.id,
    ),
  ).toEqual(["payment"]);
  expect(
    contactOverview("bea", obligations, instances, payments).history,
  ).toEqual([]);
});

it("rejects inconsistent period balances instead of showing a misleading contact total", () => {
  expect(() =>
    contactOverview(
      "alex",
      [bill()],
      [period("bad", { remainingMinor: 6000 })],
    ),
  ).toThrow(/balance/);
  expect(() =>
    contactOverview("alex", [bill()], [period("bad", { currency: "USD" })]),
  ).toThrow(/currency/);
});
