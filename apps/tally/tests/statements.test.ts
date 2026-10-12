import { describe, expect, it } from "vitest";
import type { Data, Row } from "../src/core/domain/records";
import { buildStatement } from "../src/features/statements/statement";
import { statementHtml } from "../src/features/statements/statement-html";
import { formatStatementMoney } from "../src/features/statements/statement-money";

const row = (id: string, data: Data): Row => ({ id, data });
const contact = row("alice", {
  name: "Alice <script>alert(1)</script>",
  email: "alice@example.test",
});
const debt = (id: string, changes: Data = {}) =>
  row(id, {
    contactId: "alice",
    title: id,
    currency: "PHP",
    section: "iOwe",
    type: "loan",
    lifecycle: "active",
    financialStatus: "partiallyPaid",
    originalAmountMinor: 10000,
    totalPaidMinor: 3000,
    remainingMinor: 7000,
    dueDate: "2026-10-15",
    ...changes,
  });
const payment = (id: string, changes: Data = {}) =>
  row(id, {
    obligationId: "loan",
    contactId: "alice",
    currency: "PHP",
    amountMinor: 3000,
    entryType: "payment",
    paymentDate: "2026-10-01",
    recordedAt: "2026-10-01T12:00:00Z",
    direction: "owedByMe",
    paymentMethod: "cash",
    provenance: "manual",
    ...changes,
  });
function statement(
  obligations: Row[],
  payments: Row[],
  instances: Row[] = [],
  cached = false,
) {
  return buildStatement({
    contact,
    obligations,
    payments,
    instances,
    cached,
    issuedBy: "Jess",
    timezone: "Asia/Manila",
    generatedAt: "2026-10-11T12:00:00Z",
  });
}

describe("statement of account", () => {
  it("sums two valid large obligations and prints the complete currency total", () => {
    const result = statement(
      [
        debt("large-a", {
          originalAmountMinor: 700000000000,
          remainingMinor: 700000000000,
          totalPaidMinor: 0,
        }),
        debt("large-b", {
          originalAmountMinor: 700000000000,
          remainingMinor: 700000000000,
          totalPaidMinor: 0,
        }),
      ],
      [],
    );
    expect(result.summaries[0].youOweMinor).toBe(1400000000000);
    expect(statementHtml(result)).toContain("₱14,000,000,000.00");
  });

  it("sums large generated recurring periods without applying a single-record amount cap", () => {
    const result = statement(
      [
        debt("bill", {
          section: "monthlyDues",
          originalAmountMinor: null,
          remainingMinor: null,
          totalPaidMinor: null,
        }),
      ],
      [],
      [
        row("period-a", {
          obligationId: "bill",
          currency: "PHP",
          amountMinor: 700000000001,
          remainingMinor: 700000000001,
          totalPaidMinor: 0,
        }),
        row("period-b", {
          obligationId: "bill",
          currency: "PHP",
          amountMinor: 700000000002,
          remainingMinor: 700000000002,
          totalPaidMinor: 0,
        }),
      ],
    );
    expect(result.accounts[0].remainingMinor).toBe(1400000000003);
    expect(statementHtml(result)).toContain("₱14,000,000,000.03");
  });

  it("rejects aggregate overflow beyond exact safe-integer minor units", () => {
    const accounts = Array.from({ length: 9008 }, (_, i) =>
      debt(`large-${i}`, {
        originalAmountMinor: 1000000000000,
        remainingMinor: 1000000000000,
        totalPaidMinor: 0,
      }),
    );
    expect(() => statement(accounts, [])).toThrow(/total.*supported range/i);
  });

  it("retains the original amount cap for each individual obligation", () => {
    expect(() =>
      statement(
        [
          debt("too-large", {
            originalAmountMinor: 1400000000000,
            remainingMinor: 1400000000000,
            totalPaidMinor: 0,
          }),
        ],
        [],
      ),
    ).toThrow("Enter a valid amount.");
  });

  it("reconciles large correction histories exactly even when intermediate payment sums exceed safe integers", () => {
    const periods = Array.from({ length: 8998 }, (_, i) =>
      row(`period-${i}`, {
        obligationId: "bill",
        currency: "PHP",
        amountMinor: 1000000000000,
        totalPaidMinor: i < 501 ? 1000000000000 : 999999999999,
        remainingMinor: i < 501 ? 0 : 1,
      }),
    );
    const payments = [
      ...Array.from({ length: 8998 }, (_, i) =>
        payment(`original-${i}`, {
          obligationId: "bill",
          amountMinor: 999999999999,
        }),
      ),
      ...Array.from({ length: 501 }, (_, i) =>
        payment(`replacement-${i}`, {
          obligationId: "bill",
          amountMinor: 1000000000000,
        }),
      ),
      ...Array.from({ length: 501 }, (_, i) =>
        payment(`reversal-${i}`, {
          obligationId: "bill",
          amountMinor: 999999999999,
          entryType: "reversal",
          reversesPaymentId: `original-${i}`,
        }),
      ),
    ];
    const result = statement(
      [
        debt("bill", {
          section: "monthlyDues",
          originalAmountMinor: null,
          remainingMinor: null,
          totalPaidMinor: null,
        }),
      ],
      payments,
      periods,
    );
    expect(result.accounts[0].paidMinor).toBe(8997999999991503);
    expect(result.history).toHaveLength(10000);
    expect(result.summaries[0].youOweMinor).toBe(8497);
  });

  it("prints exact cents at the aggregate safe-integer boundary, including negative and JPY values", () => {
    expect(formatStatementMoney(Number.MAX_SAFE_INTEGER, "USD")).toBe(
      "$90,071,992,547,409.91",
    );
    expect(formatStatementMoney(-Number.MAX_SAFE_INTEGER, "USD")).toBe(
      "-$90,071,992,547,409.91",
    );
    expect(formatStatementMoney(-1, "PHP")).toBe("-₱0.01");
    expect(formatStatementMoney(Number.MAX_SAFE_INTEGER, "JPY")).toBe(
      "¥9,007,199,254,740,991",
    );
    expect(() =>
      formatStatementMoney(Number.MAX_SAFE_INTEGER + 1, "PHP"),
    ).toThrow();
    expect(() => formatStatementMoney(0.5, "PHP")).toThrow();
  });
  it("keeps currencies and the two debt directions separate without counting installments twice", () => {
    const result = statement(
      [
        debt("loan", { type: "installment" }),
        debt("receivable", {
          section: "owedToMe",
          totalPaidMinor: 0,
          remainingMinor: 10000,
        }),
        debt("usd", {
          currency: "USD",
          totalPaidMinor: 0,
          remainingMinor: 10000,
        }),
        debt("other", { contactId: "bob" }),
      ],
      [payment("p1")],
      [
        row("installment", {
          obligationId: "loan",
          amountMinor: 10000,
          totalPaidMinor: 3000,
          remainingMinor: 7000,
        }),
      ],
    );
    expect(result.summaries).toEqual([
      {
        currency: "PHP",
        youOweMinor: 7000,
        owedToYouMinor: 10000,
        unknownAmounts: 0,
      },
      {
        currency: "USD",
        youOweMinor: 10000,
        owedToYouMinor: 0,
        unknownAmounts: 0,
      },
    ]);
    expect(result.accounts).toHaveLength(3);
  });

  it("sums generated recurring periods and flags unknown variable bills without inventing zero amounts", () => {
    const result = statement(
      [
        debt("bill", {
          section: "monthlyDues",
          type: "recurringDue",
          lifecycle: "ended",
          originalAmountMinor: null,
          totalPaidMinor: null,
          remainingMinor: null,
        }),
      ],
      [],
      [
        row("known", {
          obligationId: "bill",
          currency: "PHP",
          amountMinor: 5000,
          totalPaidMinor: 0,
          remainingMinor: 5000,
          financialStatus: "unpaid",
          dueDate: "2026-10-15",
        }),
        row("unknown", {
          obligationId: "bill",
          currency: "PHP",
          amountMinor: null,
          totalPaidMinor: 0,
          remainingMinor: null,
          financialStatus: "amountNeeded",
        }),
        row("skip", {
          obligationId: "bill",
          currency: "PHP",
          amountMinor: 4000,
          totalPaidMinor: 0,
          remainingMinor: 4000,
          financialStatus: "skipped",
        }),
      ],
    );
    expect(result.summaries).toEqual([
      {
        currency: "PHP",
        youOweMinor: 5000,
        owedToYouMinor: 0,
        unknownAmounts: 1,
      },
    ]);
    expect(result.accounts[0].periods).toHaveLength(3);
    expect(
      result.accounts[0].periods.find((p) => p.id === "unknown")!
        .remainingMinor,
    ).toBeNull();
    expect(
      result.accounts[0].periods.find((p) => p.id === "skip")!.excluded,
    ).toBe(true);
  });

  it("retains cancelled obligations and their payment history but excludes their balances from payable totals", () => {
    const result = statement(
      [debt("loan", { lifecycle: "cancelled", financialStatus: "cancelled" })],
      [payment("p1")],
    );
    expect(result.summaries[0].youOweMinor).toBe(0);
    expect(result.accounts[0].remainingMinor).toBe(7000);
    expect(result.accounts[0].excluded).toBe(true);
    expect(result.history).toHaveLength(1);
  });

  it("retains originals, reversals and replacements with immutable references and recorded dates", () => {
    const result = statement(
      [debt("loan", { totalPaidMinor: 2000, remainingMinor: 8000 })],
      [
        payment("p1"),
        payment("r1", {
          entryType: "reversal",
          reversesPaymentId: "p1",
          correctionReason: "Wrong amount",
          recordedAt: "2026-10-10T12:00:00Z",
        }),
        payment("replacement", {
          amountMinor: 2000,
          paymentDate: "2026-10-02",
          recordedAt: "2026-10-10T12:01:00Z",
        }),
      ],
    );
    expect(
      result.history.map((entry) => [entry.id, entry.signedAmountMinor]),
    ).toEqual([
      ["p1", 3000],
      ["r1", -3000],
      ["replacement", 2000],
    ]);
    expect(result.history[0].reversed).toBe(true);
    expect(result.history[1]).toMatchObject({
      reversesPaymentId: "p1",
      recordedAt: "2026-10-10T12:00:00Z",
      notes: "Wrong amount",
    });
  });

  it("refuses history that cannot reconcile with current confirmed balances", () => {
    expect(() => statement([debt("loan")], [])).toThrow(/history.*balance/i);
    expect(() =>
      statement(
        [debt("loan", { totalPaidMinor: 0, remainingMinor: 10000 })],
        [
          payment("r1", {
            entryType: "reversal",
            reversesPaymentId: "missing",
          }),
        ],
      ),
    ).toThrow(/reversal/i);
    expect(() => statement([], [payment("p1")])).toThrow(/linked obligation/i);
  });

  it("rejects an unsupported entry type and a currency mismatch rather than treating either as payment", () => {
    expect(() =>
      statement([debt("loan")], [payment("p1", { entryType: "pending" })]),
    ).toThrow(/payment/i);
    expect(() =>
      statement([debt("loan")], [payment("p1", { currency: "USD" })]),
    ).toThrow(/currency/i);
  });

  it("escapes private user text and labels cached/current data in printable output", () => {
    const result = statement(
      [debt("loan")],
      [payment("p1", { notes: "<img src=x onerror=alert(2)>" })],
      [],
      true,
    );
    const html = statementHtml(result);
    expect(html).toContain("Alice &lt;script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(2)&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Cached data");
    expect(html).toContain("Current balances");
    expect(html).toContain("All recorded payments and reversals");
    expect(html).toContain("2026-10-11");
    expect(html).toContain("p1");
  });

  it("distinguishes assumed automatic deductions from user confirmation without mutating the ledger", () => {
    const base = {
      contact,
      obligations: [debt("loan")],
      payments: [payment("p1", { provenance: "assumedAutomatic" })],
      instances: [],
      cached: false,
      issuedBy: "Jess",
      timezone: "Asia/Manila",
      generatedAt: "2026-10-11T12:00:00Z",
    };
    const assumed = buildStatement(base);
    expect(assumed.assumedPayments).toBe(1);
    expect(assumed.history[0].provenanceLabel).toBe(
      "Automatic · unconfirmed / assumed",
    );
    expect(statementHtml(assumed)).toContain(
      "Automatic · unconfirmed / assumed",
    );
    expect(statementHtml(assumed)).not.toContain("Current confirmed records");
    const confirmed = buildStatement({
      ...base,
      evidence: [
        row("e1", {
          paymentId: "p1",
          kind: "userConfirmed",
          recordedAt: "2026-10-10T12:00:00Z",
        }),
      ],
    });
    expect(confirmed.assumedPayments).toBe(0);
    expect(confirmed.history[0]).toMatchObject({
      provenanceLabel: "Automatic · user-confirmed",
      confirmationReference: "e1",
    });
    expect(confirmed.accounts[0].paidMinor).toBe(3000);
  });

  it("shows calculated principal and interest while legacy metadata stays informational", () => {
    const result = statement(
      [
        debt("loan", {
          interestInfo: {
            calculationVersion: 1,
            principalMinor: 9500,
            interestMinor: 500,
            totalMinor: 10000,
            rateBasisPoints: 526,
            basis: "oneTime",
          },
        }),
      ],
      [payment("p1")],
    );
    expect(result.accounts[0]).toMatchObject({
      principalMinor: 9500,
      interestMinor: 500,
    });
    expect(statementHtml(result)).toContain("Principal");
    expect(statementHtml(result)).toContain("Interest amount");
  });
});
