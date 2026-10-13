import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StatementScreen } from "../src/features/statements/statement-screen";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ contactId: "alice" }),
  router: { push: jest.fn() },
}));
const mockRecords = jest.fn();
const mockCheck = jest.fn();
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({
    repo: {
      owner: "jess",
      namespace: "test",
      records: mockRecords,
      check: mockCheck,
    },
    profile: { displayName: "Jess", timezone: "Asia/Manila" },
    cached: false,
    pending: [{ status: "review" }],
  }),
}));
const mockExport = jest.fn(async (..._args: unknown[]) => {});
jest.mock("../src/features/statements/export-pdf", () => ({
  exportStatementPdf: (...args: unknown[]) => mockExport(...args),
}));
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
const fixture = {
  contacts: [{ id: "alice", data: { name: "Alice" } }],
  obligations: [
    {
      id: "loan",
      data: {
        title: "Tuition loan",
        contactId: "alice",
        currency: "PHP",
        section: "iOwe",
        type: "loan",
        originalAmountMinor: 10000,
        totalPaidMinor: 3000,
        remainingMinor: 7000,
        lifecycle: "active",
        financialStatus: "partiallyPaid",
      },
    },
  ],
  obligationInstances: [],
  paymentEvidence: [],
  payments: [
    {
      id: "p1",
      data: {
        obligationId: "loan",
        contactId: "alice",
        currency: "PHP",
        amountMinor: 3000,
        direction: "owedByMe",
        entryType: "payment",
        paymentDate: "2026-10-01",
        recordedAt: "2026-10-01T12:00:00Z",
        paymentMethod: "cash",
      },
    },
  ],
};
beforeEach(() => {
  mockRecords.mockReset();
  mockExport.mockClear();
  mockCheck.mockClear();
  mockRecords.mockImplementation(async (collection: keyof typeof fixture) => ({
    rows: fixture[collection],
    cached: false,
  }));
});
async function mount() {
  await render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: Infinity } },
        })
      }
    >
      <StatementScreen />
    </QueryClientProvider>,
  );
}

it("previews one complete current snapshot and exports that same snapshot", async () => {
  await mount();
  expect(await screen.findByText("Alice")).toBeTruthy();
  expect(screen.getAllByText("₱70.00").length).toBeGreaterThan(0);
  expect(screen.getByText("Payment · p1")).toBeTruthy();
  expect(screen.getByText(/1 saved action/)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Export PDF" }));
  expect(mockExport).toHaveBeenCalledWith(
    expect.objectContaining({
      contactName: "Alice",
      history: [expect.objectContaining({ id: "p1" })],
    }),
    expect.any(Function),
  );
});

it("labels cached records in the preview and export", async () => {
  mockRecords.mockImplementation(async (collection: keyof typeof fixture) => ({
    rows: fixture[collection],
    cached: collection === "payments",
  }));
  await mount();
  expect(await screen.findByText(/Cached data/)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Export PDF" }));
  expect(mockExport).toHaveBeenCalledWith(
    expect.objectContaining({ cached: true }),
    expect.any(Function),
  );
});

it("previews a large valid multi-account total without changing each record's bound", async () => {
  mockRecords.mockImplementation(async (collection: keyof typeof fixture) => ({
    rows:
      collection === "obligations"
        ? ["large-a", "large-b"].map((id) => ({
            id,
            data: {
              title: id,
              contactId: "alice",
              currency: "PHP",
              section: "iOwe",
              type: "loan",
              originalAmountMinor: 700000000000,
              remainingMinor: 700000000000,
              totalPaidMinor: 0,
              lifecycle: "active",
            },
          }))
        : collection === "payments"
          ? []
          : fixture[collection],
    cached: false,
  }));
  await mount();
  expect(await screen.findByText("₱14,000,000,000.00")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Export PDF" })).toBeTruthy();
});

it("refuses export if a collection fails instead of presenting a partial history", async () => {
  mockRecords.mockImplementation(async (collection: keyof typeof fixture) => {
    if (collection === "payments")
      throw new Error("Complete payment history unavailable.");
    return { rows: fixture[collection], cached: false };
  });
  await mount();
  expect(
    await screen.findByText("Complete payment history unavailable."),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Export PDF" })).toBeNull();
  expect(mockExport).not.toHaveBeenCalled();
});

it("filters payment activity with the calendar while exporting the same current balances and scope", async () => {
  await mount();
  expect(await screen.findByText("Payment · p1")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: /^From:/ }));
  await fireEvent.press(screen.getByRole("button", { name: "Choose year" }));
  await fireEvent.press(screen.getByRole("button", { name: "2026" }));
  await fireEvent.press(screen.getByRole("button", { name: "October" }));
  await fireEvent.press(screen.getByRole("button", { name: "Oct 2, 2026" }));
  expect(screen.queryByText("Payment · p1")).toBeNull();
  expect(screen.getAllByText("₱70.00").length).toBeGreaterThan(0);
  expect(screen.getByText("Payment dates: Oct 2, 2026 onward")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Export PDF" }));
  expect(mockExport).toHaveBeenLastCalledWith(
    expect.objectContaining({
      history: [],
      historyRange: { from: "2026-10-02", to: null },
      summaries: [expect.objectContaining({ youOweMinor: 7000 })],
    }),
    expect.any(Function),
  );
  await fireEvent.press(screen.getByRole("button", { name: "All history" }));
  expect(screen.getByText("Payment · p1")).toBeTruthy();
});

it("blocks export for a From date later than the To date until corrected", async () => {
  await mount();
  await screen.findByText("Alice");
  for (const [field, day] of [
    ["From", "Oct 3, 2026"],
    ["To", "Oct 1, 2026"],
  ]) {
    await fireEvent.press(
      screen.getByRole("button", { name: new RegExp(`^${field}:`) }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Choose year" }));
    await fireEvent.press(screen.getByRole("button", { name: "2026" }));
    await fireEvent.press(screen.getByRole("button", { name: "October" }));
    await fireEvent.press(screen.getByRole("button", { name: day }));
  }
  expect(
    screen.getByText("From date must be on or before To date."),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Export PDF" })).toBeDisabled();
  expect(mockExport).not.toHaveBeenCalled();
});
