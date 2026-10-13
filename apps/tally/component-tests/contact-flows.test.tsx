import React from "react";
import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import { PeopleScreen } from "../src/features/people/people-screen";
import { PersonScreen } from "../src/features/people/person-screen";
import type { Row } from "../src/core/domain/records";

const mockPush = jest.fn();
let mockId = "alex";
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useLocalSearchParams: () => ({ id: mockId }),
}));
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({
    profile: { timezone: "Asia/Manila", defaultCurrency: "PHP" },
  }),
}));
const mockRows: Record<string, Row[]> = {};
let mockFailed = "";
let mockPending = "";
const mockRefetch = jest.fn();
jest.mock("../src/shared/queries", () => ({
  useRecords: (collection: string) => ({
    data:
      mockFailed === collection || mockPending === collection
        ? undefined
        : { rows: mockRows[collection] ?? [], cached: false },
    isPending: mockPending === collection,
    error: mockFailed === collection ? new Error("Connection failed") : null,
    refetch: mockRefetch,
  }),
}));

beforeEach(() => {
  mockId = "alex";
  mockFailed = "";
  mockPending = "";
  mockPush.mockClear();
  mockRefetch.mockClear();
  mockRows.contacts = [
    { id: "alex", data: { displayName: "Alex", kind: "person" } },
    { id: "bea", data: { displayName: "Bea" } },
  ];
  mockRows.obligations = [
    {
      id: "loan",
      data: {
        title: "Loan",
        contactId: "alex",
        currency: "PHP",
        section: "iOwe",
        remainingMinor: 10000,
        lifecycle: "active",
      },
    },
    {
      id: "lent",
      data: {
        title: "Lent",
        contactId: "alex",
        currency: "PHP",
        section: "owedToMe",
        remainingMinor: 20000,
        lifecycle: "active",
      },
    },
    {
      id: "archived",
      data: {
        title: "Old loan",
        contactId: "alex",
        currency: "PHP",
        section: "iOwe",
        remainingMinor: 99000,
        archived: true,
      },
    },
    {
      id: "bill",
      data: {
        title: "Shared utility",
        contactId: "bea",
        currency: "PHP",
        section: "monthlyDues",
        lifecycle: "paused",
      },
    },
  ];
  mockRows.obligationInstances = [
    {
      id: "old-bill",
      data: {
        obligationId: "bill",
        contactId: "alex",
        currency: "PHP",
        amountMinor: 7000,
        remainingMinor: 7000,
        totalPaidMinor: 0,
        dueDate: "2026-09-15",
        financialStatus: "pending",
      },
    },
    {
      id: "unknown",
      data: {
        obligationId: "bill",
        contactId: "alex",
        currency: "PHP",
        amountMinor: null,
        remainingMinor: null,
        totalPaidMinor: 0,
        dueDate: "2026-10-15",
        financialStatus: "pending",
      },
    },
    {
      id: "new-bill",
      data: {
        obligationId: "bill",
        contactId: "bea",
        currency: "PHP",
        amountMinor: 5000,
        remainingMinor: 5000,
        totalPaidMinor: 0,
        dueDate: "2026-11-15",
        financialStatus: "pending",
      },
    },
    {
      id: "skipped",
      data: {
        obligationId: "bill",
        contactId: "alex",
        currency: "PHP",
        amountMinor: 9000,
        remainingMinor: 9000,
        totalPaidMinor: 0,
        financialStatus: "skipped",
      },
    },
  ];
  mockRows.payments = [];
});

it("shows separate relationship balances including historical recurring periods and unknown bills", async () => {
  await render(<PeopleScreen />);
  const alex = within(screen.getByRole("button", { name: "Alex" }));
  expect(alex.getByText("You owe ₱170.00")).toBeTruthy();
  expect(alex.getByText("Owes you ₱200.00")).toBeTruthy();
  expect(alex.getByText(/1 bill amount needed/)).toBeTruthy();
  const bea = within(screen.getByRole("button", { name: "Bea" }));
  expect(bea.getByText("You owe ₱50.00")).toBeTruthy();
  expect(bea.queryByText(/bill amount needed/)).toBeNull();
});

it("shows the original contact's recurring account and opens an obligation preselected for that contact", async () => {
  await render(<PersonScreen />);
  expect(screen.getByText("₱170.00")).toBeTruthy();
  expect(screen.getByText("Shared utility")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Add obligation" }));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/add",
    params: { contactId: "alex" },
  });
});

it.each(["obligations", "obligationInstances"])(
  "keeps contact balances unavailable when %s fails",
  async (collection) => {
    mockFailed = collection;
    await render(<PeopleScreen />);
    expect(screen.getByText("Connection failed")).toBeTruthy();
    expect(screen.queryByText(/You owe ₱/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(mockRefetch).toHaveBeenCalled();
  },
);

it("does not present an empty payment history when payments fail", async () => {
  mockFailed = "payments";
  await render(<PersonScreen />);
  expect(screen.getByText("Connection failed")).toBeTruthy();
  expect(screen.queryByText("No payments recorded yet.")).toBeNull();
});
