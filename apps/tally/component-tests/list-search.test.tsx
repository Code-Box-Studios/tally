import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { PeopleScreen } from "../src/features/people/people-screen";
import { ObligationsScreen } from "../src/features/obligations/obligations-screen";
import type { Collection, Row } from "../src/core/domain/records";

let mockParams = {};
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("../src/core/domain/date", () => ({
  ...jest.requireActual("../src/core/domain/date"),
  todayInZone: () => "2026-10-13",
}));
beforeEach(() => {
  mockParams = {};
  mockRows.obligationInstances = [];
});
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({
    profile: { defaultCurrency: "PHP", timezone: "Asia/Manila" },
  }),
}));
const mockRows: Partial<Record<Collection, Row[]>> = {
  contacts: [
    {
      id: "alex",
      data: {
        name: "Alex",
        kind: "person",
        email: "alex@example.com",
        phone: "",
        notes: "",
      },
    },
    {
      id: "bea",
      data: {
        name: "Bea",
        kind: "person",
        email: "bea@example.com",
        phone: "",
        notes: "",
      },
    },
  ],
  obligations: [
    {
      id: "borrowed",
      data: {
        title: "Laptop loan",
        section: "iOwe",
        currency: "PHP",
        remainingMinor: 10000,
        financialStatus: "pending",
        lifecycle: "active",
        contactId: "alex",
      },
    },
    {
      id: "lent",
      data: {
        title: "Loan to Bea",
        section: "owedToMe",
        currency: "PHP",
        remainingMinor: 20000,
        financialStatus: "pending",
        lifecycle: "active",
        contactId: "bea",
      },
    },
    {
      id: "bill",
      data: {
        title: "Internet bill",
        section: "monthlyDues",
        currency: "PHP",
        defaultAmountMinor: 30000,
        remainingMinor: 0,
        lifecycle: "active",
        paymentMode: "manual",
      },
    },
  ],
  categories: [],
  paymentSources: [],
};
jest.mock("../src/shared/queries", () => ({
  useRecords: (collection: Collection) => ({
    data: { rows: mockRows[collection] ?? [], cached: false },
    isPending: false,
    error: null,
  }),
}));

it("clears a people search and restores the other contacts", async () => {
  await render(<PeopleScreen />);
  expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  await fireEvent.changeText(screen.getByLabelText("Search people"), "BEA");
  expect(screen.queryByRole("button", { name: "Alex" })).toBeNull();
  expect(screen.getByRole("button", { name: "Bea" })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByRole("button", { name: "Alex" })).toBeTruthy();
  expect(screen.getByLabelText("Search people").props.value).toBe("");
  expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
});

it("shows every obligation type by default and lets users narrow the list", async () => {
  await render(<ObligationsScreen />);
  expect(
    screen.getByRole("radio", { name: "All" }).props.accessibilityState.checked,
  ).toBe(true);
  expect(screen.getByRole("button", { name: "Laptop loan" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Loan to Bea" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Internet bill" })).toBeTruthy();
  await fireEvent.press(screen.getByRole("radio", { name: "Owed to Me" }));
  expect(screen.getByRole("button", { name: "Loan to Bea" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Laptop loan" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Internet bill" })).toBeNull();
  await fireEvent.press(screen.getByRole("radio", { name: "All" }));
  await fireEvent.changeText(
    screen.getByLabelText("Search obligations"),
    "internet",
  );
  expect(screen.queryByRole("button", { name: "Loan to Bea" })).toBeNull();
  expect(screen.getByRole("button", { name: "Internet bill" })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByRole("button", { name: "Loan to Bea" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Laptop loan" })).toBeTruthy();
});

it("filters all sections using each obligation's remaining or bill amount", async () => {
  await render(<ObligationsScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Filters" }));
  await fireEvent.press(screen.getByRole("radio", { name: "PHP" }));
  await fireEvent.changeText(
    screen.getByLabelText("Minimum remaining / bill amount"),
    "250",
  );
  expect(screen.getByRole("button", { name: "Internet bill" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Loan to Bea" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Laptop loan" })).toBeNull();
  await fireEvent.changeText(
    screen.getByLabelText("Minimum remaining / bill amount"),
    "150",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Maximum remaining / bill amount"),
    "250",
  );
  expect(screen.getByRole("button", { name: "Loan to Bea" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Internet bill" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByRole("button", { name: "Laptop loan" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Internet bill" })).toBeTruthy();
});

it("opens all overdue payable obligations including an older unknown bill", async () => {
  mockParams = { section: "payable", currency: "PHP", status: "overdue" };
  mockRows.obligationInstances = [
    {
      id: "old",
      data: {
        obligationId: "bill",
        section: "monthlyDues",
        remainingMinor: null,
        dueDate: "2026-08-01",
        financialStatus: "pending",
      },
    },
    {
      id: "loan-due",
      data: {
        obligationId: "borrowed",
        section: "iOwe",
        remainingMinor: 10000,
        dueDate: "2026-10-01",
        financialStatus: "pending",
      },
    },
  ];
  await render(<ObligationsScreen />);
  expect(screen.getByRole("button", { name: "Internet bill" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Laptop loan" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Loan to Bea" })).toBeNull();
});
it("ignores unknown or repeated navigation filter values", async () => {
  mockParams = {
    section: ["owedToMe", "monthlyDues"],
    currency: "FAKE",
    status: "delete",
  };
  await render(<ObligationsScreen />);
  expect(screen.getByRole("button", { name: "Internet bill" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Laptop loan" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Loan to Bea" })).toBeTruthy();
});
