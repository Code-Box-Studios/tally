import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CorrectionForm } from "../src/features/payments/correction-form";
const mockExecute = jest.fn(async () => ({ status: "synced" }));
const mockQuery = jest.fn();
let mockPending: unknown[] = [];
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({
    profile: { timezone: "Asia/Manila" },
    execute: mockExecute,
    pending: mockPending,
  }),
}));
jest.mock("../src/shared/queries", () => ({ useRecords: () => mockQuery() }));
jest.mock("../src/shared/theme", () => ({
  useTheme: () => ({
    surface: "#fff",
    ink: "#111",
    muted: "#555",
    border: "#ddd",
    primary: "#365",
    background: "#fff",
  }),
}));
const obligation = {
  id: "loan",
  data: {
    type: "installment",
    currency: "PHP",
    originalAmountMinor: 20000,
    totalPaidMinor: 10000,
    remainingMinor: 10000,
    installmentInstanceIds: ["first", "last"],
    revision: 3,
  },
};
const payment = {
  id: "paid",
  data: {
    obligationId: "loan",
    currency: "PHP",
    entryType: "payment",
    amountMinor: 10000,
    paymentDate: "2026-10-01",
    allocations: [{ instanceId: "last", amountMinor: 10000 }],
  },
};
const rows = [
  {
    id: "first",
    data: {
      obligationId: "loan",
      currency: "PHP",
      periodLabel: "Installment 1",
      dueDate: "2026-10-01",
      amountMinor: 10000,
      totalPaidMinor: 0,
      remainingMinor: 10000,
      closed: false,
    },
  },
  {
    id: "last",
    data: {
      obligationId: "loan",
      currency: "PHP",
      periodLabel: "Installment 2",
      dueDate: "2026-11-01",
      amountMinor: 10000,
      totalPaidMinor: 10000,
      remainingMinor: 0,
      closed: true,
    },
  },
];
beforeEach(() => {
  mockExecute.mockClear();
  mockPending = [];
  mockQuery.mockReturnValue({
    isPending: false,
    error: null,
    data: { rows, cached: false },
  });
});
it("shows same-amount preservation then exact oldest-first balances for an amount change", async () => {
  await render(
    <CorrectionForm
      obligation={obligation}
      payment={payment}
      onDone={() => {}}
    />,
  );
  await fireEvent.press(
    screen.getByRole("radio", { name: "Reverse and replace" }),
  );
  expect(
    screen.getByText(/same amount keeps the original installment allocations/i),
  ).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Correct amount"), "50");
  expect(screen.getByText(/oldest unpaid installment first/i)).toBeTruthy();
  expect(
    screen.getByText("Remaining before ₱100.00 · after ₱50.00"),
  ).toBeTruthy();
  expect(
    screen.getByText("Remaining before ₱0.00 · after ₱100.00"),
  ).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Reason"), "Wrong amount");
  await fireEvent.press(
    screen.getByRole("button", { name: "Save correction" }),
  );
  expect(mockExecute).toHaveBeenCalledWith(
    "correctPayment",
    expect.objectContaining({
      expectedObligationRevision: 3,
      replacement: expect.objectContaining({ amountMinor: 5000 }),
    }),
  );
});
it("keeps correction disabled while the complete installment schedule loads", async () => {
  mockQuery.mockReturnValue({ isPending: true, data: undefined, error: null });
  await render(
    <CorrectionForm
      obligation={obligation}
      payment={payment}
      onDone={() => {}}
    />,
  );
  expect(screen.getByText(/Loading installment schedule/)).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Save correction" }),
  ).toBeDisabled();
});
it("blocks a correction while a saved financial action awaits confirmation", async () => {
  mockPending = [{ status: "pending", payload: { obligationId: "loan" } }];
  await render(
    <CorrectionForm
      obligation={obligation}
      payment={payment}
      onDone={() => {}}
    />,
  );
  expect(screen.getByText(/saved action for this obligation/i)).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Save correction" }),
  ).toBeDisabled();
});
it("shows a failed schedule load and a retry without enabling the correction", async () => {
  const retry = jest.fn();
  mockQuery.mockReturnValue({
    isPending: false,
    data: undefined,
    error: new Error("Schedule unavailable"),
    refetch: retry,
  });
  await render(
    <CorrectionForm
      obligation={obligation}
      payment={payment}
      onDone={() => {}}
    />,
  );
  expect(screen.getByText("Schedule unavailable")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Save correction" }),
  ).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledTimes(1);
});
