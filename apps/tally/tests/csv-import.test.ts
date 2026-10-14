import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { parseCsv, suggestMapping } from "../src/features/import/csv";
import {
  buildImportPreview,
  type ImportContext,
} from "../src/features/import/import-model";

const context: ImportContext = {
  owner: "owner",
  environment: "test",
  currency: "PHP",
  timezone: "Asia/Manila",
  today: "2026-10-14",
  defaultKind: "borrowed",
  defaultCategoryId: "loans",
  categories: [{ id: "loans", data: { name: "Loans", active: true } }],
  contacts: [{ id: "alice", data: { displayName: "Alice", archived: false } }],
  sources: [],
  existing: [],
  pending: [],
};
const digest = async (value: string) =>
  createHash("sha256").update(value).digest("hex");
async function preview(csv: string, overrides: Partial<ImportContext> = {}) {
  const table = parseCsv(csv);
  return buildImportPreview(
    table,
    suggestMapping(table.headers),
    { ...context, ...overrides },
    digest,
  );
}

it("rejects historical status and lifecycle columns instead of recreating settled debt", async () => {
  for (const heading of [
    "Status",
    "Lifecycle",
    "Closed",
    "Settled",
    "Cancelled",
    "Is Active",
  ]) {
    const [row] = await preview(
      `Title,Amount,Date,${heading}\nLoan,100,2026-01-01,Paid`,
    );
    expect(row.errors.length, heading).toBeGreaterThan(0);
    expect(row.selected, heading).toBe(false);
    const table = parseCsv(
      `Title,Amount,Date,${heading}\nLoan,100,2026-01-01,100`,
    );
    const forcedMapping = suggestMapping(table.headers);
    forcedMapping[1] = "";
    forcedMapping[3] = "amount";
    const [forced] = await buildImportPreview(
      table,
      forcedMapping,
      context,
      digest,
    );
    expect(forced.errors.length, heading).toBeGreaterThan(0);
  }
});

it("does not permanently skip distinct installment schedules with matching financial summary", async () => {
  const rows = await preview(
    "Title,Type,Amount,Date,Installment Count,First Due Date,Installment Frequency\nPhone,installment,3000,2026-01-01,2,2026-03-01,monthly\nPhone,installment,3000,2026-01-01,3,2026-02-01,monthly",
  );
  expect(rows.every((row) => row.errors.length === 0)).toBe(true);
  expect(rows[0].commandId).not.toBe(rows[1].commandId);
  expect(rows[1].duplicate).toBe("existing-record");
  expect(rows[1].selected).toBe(false);
});

it("reads BOM, quoted commas, escaped quotes, CRLF and multiline cells", () => {
  expect(
    parseCsv('\ufeffTitle,Notes\r\n"Loan, A","Said ""yes""\r\nNext line"\r\n')
      .rows,
  ).toEqual([["Loan, A", 'Said "yes"\r\nNext line']]);
  expect(() => parseCsv('Title,Amount\n"Loan,100')).toThrow(/quote/i);
  expect(() => parseCsv("Title,Amount\nLoan,100,extra")).toThrow(/columns/i);
  expect(() => parseCsv("Title\n" + "x".repeat(20001))).toThrow(/cell/i);
  expect(() => parseCsv("Title\n" + "Loan\n".repeat(501))).toThrow(/500/);
});

it("matches normalized headings and leaves ambiguous columns unmatched", () => {
  expect(
    suggestMapping([
      "Loan title",
      "Amount",
      "Original Amount",
      "Borrowed date",
    ]),
  ).toEqual(["title", "", "", "originationDate"]);
});

it("imports exact cents and simple interest without changing principal", async () => {
  const [row] = await preview(
    "Title,Amount,Date,Due Date,Interest Rate,Interest Basis,Person\nTuition,100.01,2026-01-01,2026-02-01,10,oneTime,Alice",
  );
  expect(row.errors).toEqual([]);
  expect(row.command).toBe("createObligation");
  expect(row.payload).toMatchObject({
    amountMinor: 11001,
    contactId: "alice",
    interestInfo: {
      principalMinor: 10001,
      interestMinor: 1000,
      totalMinor: 11001,
      rateBasisPoints: 1000,
    },
  });
  expect(row.commandId).toMatch(/^import-v1-[a-f0-9]{64}$/);
});

it("builds installments and recurring variable bills", async () => {
  const [loan] = await preview(
    "Title,Type,Amount,Date,Installment Count,First Due Date,Installment Frequency\nPhone,installment,100.01,2026-01-01,3,2026-02-01,monthly",
  );
  expect(loan.errors).toEqual([]);
  expect(loan.command).toBe("createInstallment");
  expect(loan.payload).toMatchObject({
    dueDate: "2026-04-01",
    installments: [
      { dueDate: "2026-02-01", amountMinor: 3333 },
      { dueDate: "2026-03-01", amountMinor: 3333 },
      { dueDate: "2026-04-01", amountMinor: 3335 },
    ],
  });
  const [bill] = await preview(
    "Title,Type,Amount,Amount Kind,Start Date,Frequency\nElectricity,recurring,,variable,2026-11-01,monthly",
  );
  expect(bill.errors).toEqual([]);
  expect(bill.payload).toMatchObject({
    amountKind: "variable",
    defaultAmountMinor: null,
    paymentMode: "manual",
    recurrence: {
      startDate: "2026-11-01",
      unit: "months",
      interval: 1,
      preferredDay: 1,
    },
  });
});

it("blocks missing dates, unknown references and unsupported financial data", async () => {
  for (const csv of [
    "Title,Amount\nLoan,100",
    "Title,Amount,Date,Person\nLoan,100,2026-01-01,Missing",
    "Title,Amount,Date,Amount Paid\nLoan,100,2026-01-01,50",
    "Title,Amount,Date,Compound Period\nLoan,100,2026-01-01,monthly",
    "Title,Amount,Date,Interest Rate\nLoan,100,2026-01-01,5",
    "Title,Amount,Date\nLoan,1.001,2026-01-01",
    "Title,Amount,Date\nLoan,100,2026-12-01",
  ]) {
    const [row] = await preview(csv);
    expect(row.errors.length, csv).toBeGreaterThan(0);
    expect(row.selected).toBe(false);
    expect(row.payload).toBeNull();
  }
});

it("detects file, queued and existing duplicates and keeps stable IDs after reorder", async () => {
  const csv = "Title,Amount,Date\nLoan,100,2026-01-01\nLoan,100,2026-01-01";
  const rows = await preview(csv);
  expect(rows[0].selected).toBe(true);
  expect(rows[1].duplicate).toBe("file");
  expect(rows[1].selected).toBe(false);
  const [reordered] = await preview(
    "Date,Amount,Title\n2026-01-01,100.00,Loan",
  );
  expect(reordered.commandId).toBe(rows[0].commandId);
  const [existing] = await preview(csv, {
    existing: [
      {
        id: "existing",
        data: {
          ...rows[0].payload!,
          originalAmountMinor: 10000,
          type: "owedByMe",
        },
      },
    ],
  });
  expect(existing.duplicate).toBe("existing-record");
  const [pending] = await preview(csv, {
    pending: [
      {
        id: rows[0].commandId!,
        owner: "owner",
        environment: "test",
        schema: 1,
        name: "createObligation",
        payload: rows[0].payload!,
        status: "pending",
        createdAt: "",
        leaseUntil: 0,
        error: null,
        result: null,
      },
    ],
  });
  expect(pending.duplicate).toBe("saved-action");
  expect(pending.selected).toBe(false);
});

it("flags financial duplicates even when notes differ and isolates owner/environment IDs", async () => {
  const [first, duplicate] = await preview(
    "Title,Amount,Date,Notes\nLoan,100,2026-01-01,First copy\nLoan,100,2026-01-01,Other notes",
  );
  expect(duplicate.duplicate).toBe("existing-record");
  expect(duplicate.selected).toBe(false);
  const [otherOwner] = await preview(
    "Title,Amount,Date,Notes\nLoan,100,2026-01-01,First copy",
    { owner: "other" },
  );
  const [otherEnvironment] = await preview(
    "Title,Amount,Date,Notes\nLoan,100,2026-01-01,First copy",
    { environment: "production" },
  );
  expect(otherOwner.commandId).not.toBe(first.commandId);
  expect(otherEnvironment.commandId).not.toBe(first.commandId);
});

it("refuses conflicting loan directions and silently ignored automatic payment settings", async () => {
  const [conflict] = await preview(
    "Title,Type,Direction,Amount,Date\nLoan,lent,borrowed,100,2026-01-01",
  );
  expect(conflict.errors.length).toBeGreaterThan(0);
  const [automatic] = await preview(
    "Title,Type,Amount,Date,Frequency,Payment Mode\nBill,recurring,100,2026-01-01,monthly,automatic",
  );
  expect(automatic.errors.length).toBeGreaterThan(0);
});

it("resolves active named references and rejects ambiguous or inactive matches", async () => {
  const csv = "Title,Amount,Date,Person\nLoan,100,2026-01-01,Alice";
  const [ambiguous] = await preview(csv, {
    contacts: [
      ...context.contacts,
      { id: "second", data: { displayName: "Alice", archived: false } },
    ],
  });
  expect(ambiguous.errors.length).toBeGreaterThan(0);
  const [inactive] = await preview(csv, {
    categories: [{ id: "loans", data: { name: "Loans", active: false } }],
  });
  expect(inactive.errors.length).toBeGreaterThan(0);
  const [jpy] = await preview(
    "Title,Amount,Currency,Date\nLoan,100,JPY,2026-01-01",
  );
  expect(jpy.payload?.amountMinor).toBe(100);
});
