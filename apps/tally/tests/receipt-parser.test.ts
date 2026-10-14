import { describe, expect, it } from "vitest";
import {
  appendReceiptReference,
  parseReceiptText,
} from "../src/features/payments/receipt-parser";

describe("receipt review suggestions", () => {
  it("extracts the paid total, civil date, and reference without choosing fees or balances", () => {
    const result = parseReceiptText(
      "PAYMENT SUCCESSFUL\nSubtotal PHP 1,200.00\nFee PHP 15.00\nAmount paid PHP 1,215.00\nBalance PHP 8,000.00\nOctober 14, 2026 10:45 AM\nReference No. 001234567890",
      "PHP",
    );
    expect(result.draft).toEqual({
      amount: "1215.00",
      paymentDate: "2026-10-14",
      reference: "001234567890",
    });
  });
  it("reads labels whose values are on the next line", () => {
    expect(
      parseReceiptText(
        "Amount\n₱ 2,500.50\nDate\n2026-10-14\nTransaction ID\nAB-001234",
        "PHP",
      ).draft,
    ).toEqual({
      amount: "2500.50",
      paymentDate: "2026-10-14",
      reference: "AB-001234",
    });
  });
  it("leaves competing totals and ambiguous dates for review", () => {
    const result = parseReceiptText(
      "Total PHP 100.00\nTotal PHP 200.00\nDate 03/04/2026",
      "PHP",
    );
    expect(result.draft.amount).toBeUndefined();
    expect(result.draft.paymentDate).toBeUndefined();
    expect(result.candidates.amount).toEqual(["100.00", "200.00"]);
    expect(result.candidates.paymentDate).toEqual(["2026-04-03", "2026-03-04"]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  it("does not convert or apply amounts in another currency", () => {
    const result = parseReceiptText("Amount paid USD 20.00\n2026-10-14", "PHP");
    expect(result.draft.amount).toBeUndefined();
    expect(result.candidates.amount).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/currency/i);
    expect(
      parseReceiptText("Total $20.00", "PHP").draft.amount,
    ).toBeUndefined();
    expect(
      parseReceiptText("Total CNY 20.00", "PHP").draft.amount,
    ).toBeUndefined();
  });
  it("does not invent missing values or recognize account numbers as payments", () => {
    expect(
      parseReceiptText("Account 001234567890\nAvailable balance 8000.00", "PHP")
        .draft,
    ).toEqual({});
    expect(parseReceiptText("", "PHP").draft).toEqual({});
  });
  it("validates dates and currency precision without rounding", () => {
    const result = parseReceiptText("Total JPY 123.45\nDate 2026-02-30", "JPY");
    expect(result.draft).toEqual({});
    expect(parseReceiptText("Total JPY 123\n14/10/2026", "JPY").draft).toEqual({
      amount: "123",
      paymentDate: "2026-10-14",
    });
  });
  it("does not select due dates or duplicate identical candidates", () => {
    const result = parseReceiptText(
      "Amount paid ₱ 100.00\nTotal paid ₱ 100.00\nDue date 2026-11-01\nPaid on 2026-10-14",
      "PHP",
    );
    expect(result.draft).toEqual({
      amount: "100.00",
      paymentDate: "2026-10-14",
    });
  });
  it("reads an unambiguous month-first numeric date", () => {
    expect(
      parseReceiptText("Paid on 10/14/2026", "PHP").draft.paymentDate,
    ).toBe("2026-10-14");
  });
});

describe("reference notes", () => {
  it("keeps existing notes and leading zeroes without duplicating a reference", () => {
    expect(appendReceiptReference("Monthly payment", "001234")).toBe(
      "Monthly payment\nReference: 001234",
    );
    expect(
      appendReceiptReference("Monthly payment\nReference: 001234", "001234"),
    ).toBe("Monthly payment\nReference: 001234");
    expect(appendReceiptReference("Keep this", "")).toBe("Keep this");
  });
  it("rejects multiline references and oversized notes instead of truncating evidence", () => {
    expect(() => appendReceiptReference("", "id\nforged note")).toThrow();
    expect(() => appendReceiptReference("a".repeat(4000), "123456")).toThrow();
  });
});
