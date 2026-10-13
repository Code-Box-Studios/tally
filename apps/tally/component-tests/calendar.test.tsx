import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CalendarScreen } from "../src/features/calendar/calendar-screen";

const mockDimensions = { width: 1280, height: 800, scale: 1, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockDimensions,
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({ profile: { timezone: "Asia/Manila" } }),
}));
jest.mock("../src/core/domain/date", () => ({
  ...jest.requireActual("../src/core/domain/date"),
  todayInZone: () => "2026-10-11",
}));
const mockRows = {
  obligations: [
    { id: "loan", data: { title: "Loan to Alex", contactId: "alex" } },
    { id: "internet", data: { title: "Internet bill" } },
  ],
  obligationInstances: [
    {
      id: "loan-oct",
      data: {
        obligationId: "loan",
        contactId: "alex",
        dueDate: "2026-10-15",
        section: "owedToMe",
        currency: "PHP",
        remainingMinor: 70000,
        amountMinor: 70000,
        financialStatus: "pending",
        paymentMode: "manual",
      },
    },
    {
      id: "internet-oct",
      data: {
        obligationId: "internet",
        dueDate: "2026-10-15",
        section: "monthlyDues",
        currency: "PHP",
        remainingMinor: 169900,
        amountMinor: 169900,
        financialStatus: "pending",
        paymentMode: "manual",
      },
    },
  ],
  contacts: [{ id: "alex", data: { name: "Alex" } }],
  categories: [],
};
jest.mock("../src/shared/queries", () => ({
  useRecords: (collection: keyof typeof mockRows) => ({
    data: { rows: mockRows[collection], cached: false },
    isPending: false,
    error: null,
  }),
}));

beforeEach(() => {
  mockDimensions.width = 1280;
});

it("keeps empty calendar cells out of day selection", async () => {
  await render(<CalendarScreen />);
  expect(screen.queryByRole("button", { name: "Empty day" })).toBeNull();
  await fireEvent.press(
    screen.getByRole("button", { name: "Oct 15, 2026, 2 due dates" }),
  );
  expect(screen.getByRole("button", { name: "Show whole month" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Loan to Alex/ })).toBeTruthy();
});

it("keeps the calendar counts consistent with the selected obligation type", async () => {
  await render(<CalendarScreen />);
  await fireEvent.press(screen.getByRole("radio", { name: "Owed to me" }));
  expect(
    screen.getByRole("button", { name: "Oct 15, 2026, 1 due date" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Internet bill/ })).toBeNull();
  expect(screen.getByRole("button", { name: /Loan to Alex/ })).toBeTruthy();
});

it("shows the month grid on mobile and keeps selected-day details when switching views", async () => {
  mockDimensions.width = 390;
  await render(<CalendarScreen />);
  expect(
    screen.getByRole("button", { name: "Oct 15, 2026, 2 due dates" }),
  ).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "Oct 2, 2026, 0 due dates" }),
  );
  expect(screen.getByText("Nothing due on this date")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Oct 15, 2026, 2 due dates" }),
  ).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Show agenda" }));
  expect(
    screen.queryByRole("button", { name: "Oct 15, 2026, 2 due dates" }),
  ).toBeNull();
  expect(screen.getByText("Nothing due on this date")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Show calendar" }));
  expect(
    screen.getByRole("button", { name: "Oct 15, 2026, 2 due dates" }),
  ).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "Show whole month" }),
  );
  expect(screen.getByRole("button", { name: /Loan to Alex/ })).toBeTruthy();
});

it("filters mobile day indicators and agenda details together when searching", async () => {
  mockDimensions.width = 390;
  await render(<CalendarScreen />);
  await fireEvent.changeText(screen.getByLabelText("Search calendar"), "Alex");
  expect(
    screen.getByRole("button", { name: "Oct 15, 2026, 1 due date" }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: /Loan to Alex/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Internet bill/ })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Clear search" }));
  expect(
    screen.getByRole("button", { name: "Oct 15, 2026, 2 due dates" }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: /Internet bill/ })).toBeTruthy();
});

it("keeps mobile month navigation and type filters usable", async () => {
  mockDimensions.width = 320;
  await render(<CalendarScreen />);
  expect(
    screen.getAllByRole("button", { name: /Oct \d+, 2026, \d+ due dates?/ }),
  ).toHaveLength(31);
  expect(screen.queryByRole("button", { name: "Empty day" })).toBeNull();
  await fireEvent.press(screen.getByRole("radio", { name: "Monthly bills" }));
  expect(
    screen.getByRole("button", { name: "Oct 15, 2026, 1 due date" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Loan to Alex/ })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Next month" }));
  expect(
    screen.getByRole("button", { name: "Month: November 2026" }),
  ).toBeTruthy();
  expect(
    screen.getAllByRole("button", { name: /Nov \d+, 2026, \d+ due dates?/ }),
  ).toHaveLength(30);
  await fireEvent.press(screen.getByRole("button", { name: "Today" }));
  expect(
    screen.getByRole("button", { name: "Month: October 2026" }),
  ).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "Show whole month" }),
  );
  expect(screen.getByRole("button", { name: /Internet bill/ })).toBeTruthy();
});

it("returns to the current day and clears the selection for the whole month", async () => {
  await render(<CalendarScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Next month" }));
  await fireEvent.press(screen.getByRole("button", { name: "Today" }));
  expect(
    screen.getByRole("button", { name: "Month: October 2026" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Loan to Alex/ })).toBeNull();
  await fireEvent.press(
    screen.getByRole("button", { name: "Show whole month" }),
  );
  expect(screen.getByRole("button", { name: /Loan to Alex/ })).toBeTruthy();
});

it("changes the mobile month through the picker and clears the selected day", async () => {
  mockDimensions.width = 390;
  await render(<CalendarScreen />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Oct 15, 2026, 2 due dates" }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Month: October 2026" }),
  );
  await fireEvent.press(screen.getByRole("button", { name: "September" }));
  expect(
    screen.getByRole("button", { name: "Month: September 2026" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Show whole month" })).toBeNull();
  expect(
    screen.getAllByRole("button", { name: /Sep \d+, 2026, \d+ due dates?/ }),
  ).toHaveLength(30);
});

it("applies and resets advanced filters through the compact mobile toolbar", async () => {
  mockDimensions.width = 390;
  await render(<CalendarScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Filters" }));
  await fireEvent.press(screen.getByRole("button", { name: "Status: All" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Paid" }));
  expect(screen.getByRole("button", { name: "Hide filters (1)" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Oct 15, 2026, 0 due dates" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Loan to Alex/ })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Reset filters" }));
  expect(screen.getByRole("button", { name: "Status: All" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Oct 15, 2026, 2 due dates" }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: /Loan to Alex/ })).toBeTruthy();
});
