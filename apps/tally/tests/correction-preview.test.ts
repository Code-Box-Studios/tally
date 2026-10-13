import { describe, expect, it } from "vitest";
import * as preview from "../src/features/payments/correction-preview";
import type { Data, Row } from "../src/core/domain/records";

const row = (id: string, data: Data): Row => ({ id, data });
const obligation = row("loan", {
  type: "installment",
  currency: "PHP",
  originalAmountMinor: 20000,
  totalPaidMinor: 10000,
  remainingMinor: 10000,
  installmentInstanceIds: ["first", "last"],
});
const payment = row("paid", {
  obligationId: "loan",
  currency: "PHP",
  entryType: "payment",
  amountMinor: 10000,
  allocations: [{ instanceId: "last", amountMinor: 10000 }],
});
const instances = [
  row("first", {
    obligationId: "loan",
    currency: "PHP",
    periodLabel: "Installment 1",
    dueDate: "2026-10-01",
    amountMinor: 10000,
    totalPaidMinor: 0,
    remainingMinor: 10000,
    closed: false,
  }),
  row("last", {
    obligationId: "loan",
    currency: "PHP",
    periodLabel: "Installment 2",
    dueDate: "2026-11-01",
    amountMinor: 10000,
    totalPaidMinor: 10000,
    remainingMinor: 0,
    closed: true,
  }),
];

describe("installment correction preview", () => {
  it("keeps chosen installment targets for an unchanged amount", () => {
    const result = preview.previewInstallmentCorrection(
      obligation,
      payment,
      instances,
      10000,
    );
    expect(result.policy).toBe("preserve");
    expect(
      result.periods.map((p) => [
        p.id,
        p.paidBeforeMinor,
        p.paidAfterMinor,
        p.remainingAfterMinor,
      ]),
    ).toEqual([
      ["first", 0, 0, 10000],
      ["last", 10000, 10000, 0],
    ]);
  });
  it("shows an amount change reopening the selected later period and paying the oldest balance first", () => {
    const result = preview.previewInstallmentCorrection(
      obligation,
      payment,
      instances,
      5000,
    );
    expect(result.policy).toBe("oldestFirst");
    expect(result.remainingBeforeMinor).toBe(10000);
    expect(result.remainingAfterMinor).toBe(15000);
    expect(
      result.periods.map((p) => [
        p.id,
        p.paidAfterMinor,
        p.remainingAfterMinor,
      ]),
    ).toEqual([
      ["first", 5000, 5000],
      ["last", 0, 10000],
    ]);
  });
  it("shows a reversal restoring the original selected periods", () => {
    const result = preview.previewInstallmentCorrection(
      obligation,
      payment,
      instances,
      null,
    );
    expect(result.policy).toBe("reverse");
    expect(result.periods.map((p) => p.remainingAfterMinor)).toEqual([
      10000, 10000,
    ]);
    expect(result.remainingAfterMinor).toBe(20000);
  });
  it("refuses an incomplete schedule, inconsistent payment, or overpayment", () => {
    expect(() =>
      preview.previewInstallmentCorrection(
        obligation,
        payment,
        instances.slice(0, 1),
        10000,
      ),
    ).toThrow(/schedule/i);
    expect(() =>
      preview.previewInstallmentCorrection(
        obligation,
        row("paid", { ...payment.data, amountMinor: 9000 }),
        instances,
        9000,
      ),
    ).toThrow(/payment|allocation/i);
    expect(() =>
      preview.previewInstallmentCorrection(
        obligation,
        payment,
        instances,
        20001,
      ),
    ).toThrow(/exceeds.*balance/i);
  });
  it("preserves multiple original targets and mirrors due-date then identity ordering when the amount changes", () => {
    const original = row("paid", {
      ...payment.data,
      allocations: [
        { instanceId: "first", amountMinor: 3000 },
        { instanceId: "last", amountMinor: 7000 },
      ],
    });
    const schedule = [
      row("first", {
        ...instances[0].data,
        totalPaidMinor: 3000,
        remainingMinor: 7000,
      }),
      row("last", {
        ...instances[1].data,
        dueDate: "2026-10-01",
        totalPaidMinor: 7000,
        remainingMinor: 3000,
        closed: false,
      }),
    ].reverse();
    expect(
      preview
        .previewInstallmentCorrection(obligation, original, schedule, 10000)
        .periods.map((p) => p.paidAfterMinor),
    ).toEqual([3000, 7000]);
    expect(
      preview
        .previewInstallmentCorrection(obligation, original, schedule, 15000)
        .periods.map((p) => p.paidAfterMinor),
    ).toEqual([10000, 5000]);
  });
});
