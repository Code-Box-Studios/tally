import React from "react";
import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import { DashboardScreen } from "../src/features/dashboard/dashboard-screen";
import type { Data, Row } from "../src/core/domain/records";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({
    profile: { defaultCurrency: "PHP", timezone: "Asia/Manila" },
    session: null,
  }),
}));
jest.mock("../src/core/domain/date", () => ({
  ...jest.requireActual("../src/core/domain/date"),
  todayInZone: () => "2026-10-13",
}));
const mockRows: Record<string, Row[]> = {
  obligations: [],
  obligationInstances: [],
  payments: [],
  activities: [],
  paymentEvidence: [],
};
jest.mock("../src/shared/queries", () => ({
  useRecords: (collection: string) => ({
    data: { rows: mockRows[collection], cached: false },
    isPending: false,
    error: null,
  }),
}));

function bill(id: string, data: Data = {}) {
  mockRows.obligations.push({
    id,
    data: {
      title: id,
      section: "monthlyDues",
      currency: "PHP",
      lifecycle: "active",
      amountKind: "variable",
      defaultAmountMinor: null,
    },
  });
  mockRows.obligationInstances.push({
    id: `${id}-october`,
    data: {
      obligationId: id,
      section: "monthlyDues",
      currency: "PHP",
      amountMinor: null,
      remainingMinor: null,
      totalPaidMinor: 0,
      dueDate: "2026-10-13",
      paymentMode: "manual",
      financialStatus: "pending",
      closed: false,
      ...data,
    },
  });
}

beforeEach(() => {
  mockPush.mockClear();
  for (const key of Object.keys(mockRows)) mockRows[key] = [];
});

it("keeps an unknown bill due today actionable instead of showing all clear", async () => {
  bill("Electricity");
  await render(<DashboardScreen />);
  const due = screen.getByRole("button", { name: "Electricity" });
  expect(within(due).getByText("Amount needed")).toBeTruthy();
  expect(
    screen.queryByText("No outstanding payments due in the next seven days."),
  ).toBeNull();
  expect(
    screen.getByText(/1 bill amount needed.*known amounts only/),
  ).toBeTruthy();
});

it("keeps totals limited to known amounts when a variable bill is unknown", async () => {
  bill("Electricity");
  bill("Internet", { amountMinor: 169900, remainingMinor: 169900 });
  await render(<DashboardScreen />);
  expect(
    screen.getByRole("button", {
      name: "You owe: ₱1,699.00. 2 active obligations",
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: "Remaining this month: ₱1,699.00. of ₱1,699.00 scheduled",
    }),
  ).toBeTruthy();
  expect(
    screen.getByText(/1 bill amount needed.*known amounts only/),
  ).toBeTruthy();
});

it("excludes closed, skipped, and cancelled unknown bills from attention", async () => {
  bill("Closed electricity", { closed: true });
  bill("Skipped electricity", { financialStatus: "skipped" });
  bill("Cancelled electricity", { financialStatus: "cancelled" });
  await render(<DashboardScreen />);
  for (const name of [
    "Closed electricity",
    "Skipped electricity",
    "Cancelled electricity",
  ])
    expect(screen.queryByRole("button", { name })).toBeNull();
  expect(screen.queryByText(/bill amounts? needed/)).toBeNull();
  expect(
    screen.getByText("No outstanding payments due in the next seven days."),
  ).toBeTruthy();
});

it("shows overdue rows even when today and upcoming payments also need attention", async () => {
  bill("Overdue electricity", {
    dueDate: "2026-10-10",
    amountMinor: 30000,
    remainingMinor: 30000,
  });
  bill("Internet today", { amountMinor: 169900, remainingMinor: 169900 });
  bill("Rent tomorrow", {
    dueDate: "2026-10-14",
    amountMinor: 800000,
    remainingMinor: 800000,
  });
  await render(<DashboardScreen />);
  expect(
    screen.getByRole("button", { name: "Overdue electricity" }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Internet today" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Rent tomorrow" })).toBeTruthy();
});

it("shows a lone overdue row once", async () => {
  bill("Overdue internet", {
    dueDate: "2026-10-10",
    amountMinor: 169900,
    remainingMinor: 169900,
  });
  await render(<DashboardScreen />);
  expect(
    screen.getAllByRole("button", { name: "Overdue internet" }),
  ).toHaveLength(1);
});

it("preserves direction and currency when opening summary cards", async () => {
  bill("Internet", { amountMinor: 10000, remainingMinor: 10000 });
  await render(<DashboardScreen />);
  await fireEvent.press(screen.getByRole("button", { name: /You owe:/ }));
  expect(mockPush).toHaveBeenLastCalledWith(
    "/obligations?section=payable&currency=PHP&status=outstanding",
  );
  await fireEvent.press(screen.getByRole("button", { name: /Owed to you:/ }));
  expect(mockPush).toHaveBeenLastCalledWith(
    "/obligations?section=owedToMe&currency=PHP&status=outstanding",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: /Remaining this month:/ }),
  );
  expect(mockPush).toHaveBeenLastCalledWith(
    "/calendar?section=payable&currency=PHP&status=outstanding",
  );
});
it("opens the complete overdue list and preserves the selected period for a due row", async () => {
  bill("Older electricity", { dueDate: "2026-08-10" });
  bill("Recent electricity", { dueDate: "2026-10-01" });
  await render(<DashboardScreen />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Review overdue obligations" }),
  );
  expect(mockPush).toHaveBeenLastCalledWith(
    "/obligations?section=payable&status=overdue",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Older electricity" }),
  );
  expect(mockPush).toHaveBeenLastCalledWith({
    pathname: "/obligations/[id]",
    params: {
      id: "Older electricity",
      instanceId: "Older electricity-october",
    },
  });
});
it("surfaces assumed deductions after their balance reaches zero, excluding confirmed and reversed entries", async () => {
  for (const title of ["Unconfirmed", "Confirmed", "Reversed"]) {
    bill(title, {
      amountMinor: 10000,
      remainingMinor: 0,
      totalPaidMinor: 10000,
      closed: true,
      deductionStatus: "deducted",
    });
    mockRows.payments.push({
      id: title,
      data: {
        obligationId: title,
        obligationInstanceId: `${title}-october`,
        amountMinor: 10000,
        currency: "PHP",
        entryType: "payment",
        provenance: "assumedAutomatic",
        paymentDate: "2026-10-13",
      },
    });
  }
  mockRows.paymentEvidence.push({
    id: "confirmation",
    data: { kind: "userConfirmed", paymentId: "Confirmed" },
  });
  mockRows.payments.push({
    id: "reversal",
    data: {
      entryType: "reversal",
      reversesPaymentId: "Reversed",
      amountMinor: 10000,
      currency: "PHP",
    },
  });
  await render(<DashboardScreen />);
  expect(screen.getByText("Confirm automatic deductions")).toBeTruthy();
  expect(screen.getByText("Unconfirmed")).toBeTruthy();
  expect(screen.queryByText("Confirmed")).toBeNull();
  expect(screen.queryByText("Reversed")).toBeNull();
  await fireEvent.press(
    screen.getByRole("button", { name: "Review deduction" }),
  );
  expect(mockPush).toHaveBeenLastCalledWith({
    pathname: "/obligations/[id]",
    params: { id: "Unconfirmed", instanceId: "Unconfirmed-october" },
  });
});
