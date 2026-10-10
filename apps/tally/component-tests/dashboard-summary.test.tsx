import React from "react";
import { render, screen } from "@testing-library/react-native";
import { DashboardScreen } from "../src/features/dashboard/dashboard-screen";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({
    profile: { defaultCurrency: "PHP", timezone: "Asia/Manila" },
    session: null,
  }),
}));
const mockRows = {
  obligations: [
    {
      id: "loan",
      data: { section: "iOwe", currency: "PHP", remainingMinor: 1000000 },
    },
    { id: "internet", data: { section: "monthlyDues", currency: "PHP" } },
    {
      id: "dollars",
      data: { section: "iOwe", currency: "USD", remainingMinor: 50000 },
    },
  ],
  obligationInstances: ["september", "october"].map((id) => ({
    id,
    data: {
      obligationId: "internet",
      section: "monthlyDues",
      currency: "PHP",
      remainingMinor: 169900,
      amountMinor: 169900,
      dueDate: "2026-10-15",
      paymentMode: "manual",
    },
  })),
  payments: [],
  activities: [],
};
jest.mock("../src/shared/queries", () => ({
  useRecords: (collection: keyof typeof mockRows) => ({
    data: { rows: mockRows[collection] },
    isPending: false,
    error: null,
  }),
}));

it("counts outstanding bills once per obligation and keeps currencies separate", async () => {
  await render(<DashboardScreen />);
  expect(
    screen.getByRole("button", {
      name: "You owe: ₱13,398.00. 2 active obligations",
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: "You owe: $500.00. 1 active obligation",
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: "Owed to you: ₱0.00. 0 active obligations",
    }),
  ).toBeTruthy();
});
