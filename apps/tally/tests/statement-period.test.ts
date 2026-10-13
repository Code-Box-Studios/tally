import { describe, expect, it } from "vitest";
import { buildStatement } from "../src/features/statements/statement";
import { statementHtml } from "../src/features/statements/statement-html";
import type { Data } from "../src/core/domain/records";

const row = (id: string, data: Data) => ({ id, data });
const debt = (id: string, currency = "PHP", section = "iOwe") =>
  row(id, {
    title: id,
    contactId: "alice",
    currency,
    section,
    lifecycle: "active",
    originalAmountMinor: 10000,
    totalPaidMinor: 3000,
    remainingMinor: 7000,
  });
const pay = (
  id: string,
  obligationId: string,
  paymentDate: string,
  amountMinor: number,
  changes: Data = {},
) =>
  row(id, {
    obligationId,
    contactId: "alice",
    paymentDate,
    amountMinor,
    currency: "PHP",
    direction: "owedByMe",
    entryType: "payment",
    provenance: "manual",
    ...changes,
  });
const input = {
  contact: row("alice", { name: "Alice" }),
  obligations: [debt("loan")],
  instances: [],
  payments: [
    pay("before", "loan", "2026-09-30", 1000),
    pay("first", "loan", "2026-10-01", 1000),
    pay("last", "loan", "2026-10-31", 1000),
  ],
  issuedBy: "Jess",
  timezone: "Asia/Manila",
  generatedAt: "2026-11-01T00:00:00Z",
  cached: false,
};

describe("statement activity period", () => {
  it("filters inclusive payment dates while retaining the current balances and complete reconciliation", () => {
    const result = buildStatement({
      ...input,
      historyRange: { from: "2026-10-01", to: "2026-10-31" },
    });
    expect(result.history.map((p) => p.id)).toEqual(["first", "last"]);
    expect(result.summaries[0].youOweMinor).toBe(7000);
    expect(result.accounts[0].paidMinor).toBe(3000);
    expect(result.activitySummaries).toEqual([
      {
        currency: "PHP",
        paidToContactMinor: 2000,
        receivedFromContactMinor: 0,
      },
    ]);
    expect(statementHtml(result)).toContain("Oct 1, 2026");
    expect(statementHtml(result)).toContain("Oct 31, 2026");
    expect(statementHtml(result)).toContain(
      "Payment dates: Oct 1, 2026 – Oct 31, 2026 (inclusive)",
    );
    expect(statementHtml(result)).toContain("Current balances");
    expect(statementHtml(result)).toContain(
      "not a historical as-of calculation",
    );
    expect(statementHtml(result)).not.toContain(">before<");
    expect(() =>
      buildStatement({
        ...input,
        payments: input.payments.slice(1),
        historyRange: { from: "2026-10-01" },
      }),
    ).toThrow(/history.*balance/);
  });

  it("defaults to all history, supports open bounds, and rejects reversed or invalid ranges", () => {
    expect(buildStatement(input).history).toHaveLength(3);
    expect(
      buildStatement({
        ...input,
        historyRange: { to: "2026-09-30" },
      }).history.map((p) => p.id),
    ).toEqual(["before"]);
    expect(
      buildStatement({ ...input, historyRange: { from: "2026-11-01" } })
        .history,
    ).toEqual([]);
    expect(() =>
      buildStatement({
        ...input,
        historyRange: { from: "2026-11-01", to: "2026-10-01" },
      }),
    ).toThrow(/From.*To/);
    expect(() =>
      buildStatement({ ...input, historyRange: { from: "2026-02-30" } }),
    ).toThrow(/calendar/);
  });

  it("keeps later-recorded immutable reversals with the original payment date and separates currencies and directions", () => {
    const result = buildStatement({
      ...input,
      obligations: [debt("loan"), debt("usd", "USD", "owedToMe")],
      payments: [
        pay("original", "loan", "2026-09-30", 4000),
        pay("reverse", "loan", "2026-09-30", 4000, {
          entryType: "reversal",
          reversesPaymentId: "original",
          recordedAt: "2026-10-10T00:00:00Z",
        }),
        pay("replacement", "loan", "2026-10-01", 3000),
        pay("received", "usd", "2026-10-01", 3000, {
          currency: "USD",
          direction: "owedToMe",
        }),
      ],
      historyRange: { from: "2026-10-01", to: "2026-10-31" },
    });
    expect(result.history.map((p) => p.id).sort()).toEqual([
      "received",
      "replacement",
    ]);
    expect(result.activitySummaries).toEqual([
      {
        currency: "PHP",
        paidToContactMinor: 3000,
        receivedFromContactMinor: 0,
      },
      {
        currency: "USD",
        paidToContactMinor: 0,
        receivedFromContactMinor: 3000,
      },
    ]);
    expect(
      result.summaries.map((s) => [
        s.currency,
        s.youOweMinor,
        s.owedToYouMinor,
      ]),
    ).toEqual([
      ["PHP", 7000, 0],
      ["USD", 0, 7000],
    ]);
  });
});

describe("statement installment schedule", () => {
  const installments = [
    row("first", {
      obligationId: "loan",
      currency: "PHP",
      periodLabel: "Installment 1 of 2",
      dueDate: "2026-10-01",
      amountMinor: 4000,
      totalPaidMinor: 3000,
      remainingMinor: 1000,
      financialStatus: "partiallyPaid",
    }),
    row("second", {
      obligationId: "loan",
      currency: "PHP",
      periodLabel: "Installment 2 of 2",
      dueDate: "2026-11-01",
      amountMinor: 6000,
      totalPaidMinor: 0,
      remainingMinor: 6000,
      financialStatus: "pending",
    }),
  ];
  const schedule = {
    ...input,
    obligations: [
      row("loan", {
        ...input.obligations[0].data,
        type: "installment",
        installmentInstanceIds: ["first", "second"],
      }),
    ],
    instances: installments,
  };
  it("shows every installment without counting its outstanding amount twice", () => {
    const result = buildStatement(schedule);
    expect(
      result.accounts[0].periods.map((p) => [
        p.title,
        p.dueDate,
        p.paidMinor,
        p.remainingMinor,
      ]),
    ).toEqual([
      ["Installment 1 of 2", "2026-10-01", 3000, 1000],
      ["Installment 2 of 2", "2026-11-01", 0, 6000],
    ]);
    expect(result.summaries[0].youOweMinor).toBe(7000);
    expect(statementHtml(result)).toContain("Installment schedule");
    expect(statementHtml(result)).toContain("Installment 2 of 2");
  });
  it("refuses missing or inconsistent canonical installment snapshots", () => {
    expect(() =>
      buildStatement({ ...schedule, instances: installments.slice(0, 1) }),
    ).toThrow(/schedule|installment/i);
    expect(() =>
      buildStatement({
        ...schedule,
        instances: [
          installments[0],
          row("second", {
            ...installments[1].data,
            totalPaidMinor: 1,
            remainingMinor: 5999,
          }),
        ],
      }),
    ).toThrow(/schedule|installment/i);
  });
});
