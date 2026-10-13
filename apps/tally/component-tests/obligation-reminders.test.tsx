import React from "react";
import { render, fireEvent, screen } from "@testing-library/react-native";
import { DetailScreen } from "../src/features/obligations/detail-screen";
import type { Row } from "../src/core/domain/records";

const mockExecute = jest.fn(async () => ({ status: "synced" }));
let mockObligation: Row;
let mockInstances: Row[] = [];
let mockParams = { id: "loan" } as { id: string; instanceId?: string };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn() },
}));
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({
    profile: { timezone: "Asia/Manila" },
    execute: mockExecute,
  }),
}));
jest.mock("../src/shared/queries", () => ({
  useRecords: (collection: string) => ({
    data: {
      rows:
        collection === "obligations"
          ? [mockObligation]
          : collection === "obligationInstances"
            ? mockInstances
            : [],
    },
    isPending: false,
    error: null,
  }),
}));
jest.mock("../src/features/attachments/attachments-panel", () => ({
  AttachmentsPanel: () => null,
}));

beforeEach(() => {
  mockExecute.mockClear();
  mockInstances = [];
  mockParams = { id: "loan" };
  mockObligation = {
    id: "loan",
    data: {
      title: "Personal loan",
      type: "loan",
      section: "iOwe",
      lifecycle: "active",
      currency: "PHP",
      originalAmountMinor: 100000,
      remainingMinor: 100000,
      totalPaidMinor: 0,
      revision: 4,
      reminderPolicy: {
        enabled: false,
        offsetDays: [14, 7],
        localTime: "18:30",
      },
    },
  };
});

it("opens and saves the existing reminder schedule without enabling it or changing its time", async () => {
  await render(<DetailScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Edit reminders" }));
  expect(
    screen.getByRole("radio", { name: "Disabled" }).props.accessibilityState
      .checked,
  ).toBe(true);
  expect(screen.getByLabelText("Days before due").props.value).toBe("14,7");
  expect(screen.getByLabelText("Reminder time (HH:MM)").props.value).toBe(
    "18:30",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Save change" }));
  expect(mockExecute).toHaveBeenCalledWith("setObligationReminder", {
    obligationId: "loan",
    expectedRevision: 4,
    reminderPolicy: { enabled: false, offsetDays: [14, 7], localTime: "18:30" },
  });
});

it("preserves an empty offset list instead of adding a due-day reminder", async () => {
  mockObligation.data.reminderPolicy = {
    enabled: true,
    offsetDays: [],
    localTime: "12:00",
  };
  await render(<DetailScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Edit reminders" }));
  await fireEvent.press(screen.getByRole("button", { name: "Save change" }));
  expect(mockExecute).toHaveBeenCalledWith(
    "setObligationReminder",
    expect.objectContaining({
      reminderPolicy: { enabled: true, offsetDays: [], localTime: "12:00" },
    }),
  );
});

it("discards unsaved reminder edits and reloads the latest saved policy when reopened", async () => {
  const view = await render(<DetailScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Edit reminders" }));
  await fireEvent.changeText(screen.getByLabelText("Days before due"), "2,0");
  await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  mockObligation = {
    ...mockObligation,
    data: {
      ...mockObligation.data,
      revision: 5,
      reminderPolicy: { enabled: true, offsetDays: [10], localTime: "08:00" },
    },
  };
  await view.rerender(<DetailScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Edit reminders" }));
  expect(screen.getByLabelText("Days before due").props.value).toBe("10");
  expect(screen.getByLabelText("Reminder time (HH:MM)").props.value).toBe(
    "08:00",
  );
});

it("focuses the linked billing period and lets the user reveal every period", async () => {
  mockObligation.data.section = "monthlyDues";
  mockParams.instanceId = "november";
  mockInstances = ["october", "november"].map((id) => ({
    id,
    data: {
      obligationId: "loan",
      periodLabel: id,
      currency: "PHP",
      amountMinor: 10000,
      remainingMinor: 10000,
      totalPaidMinor: 0,
    },
  }));
  await render(<DetailScreen />);
  expect(screen.getByText("november")).toBeTruthy();
  expect(screen.queryByText("october")).toBeNull();
  await fireEvent.press(
    screen.getByRole("button", { name: "Show all periods" }),
  );
  expect(screen.getByText("october")).toBeTruthy();
});
it("does not show another obligation's period when the link is stale or invalid", async () => {
  mockParams.instanceId = "foreign";
  mockInstances = [
    {
      id: "foreign",
      data: { obligationId: "another", periodLabel: "Private other period" },
    },
  ];
  await render(<DetailScreen />);
  expect(screen.queryByText("Private other period")).toBeNull();
  expect(
    screen.getByText(
      "The linked period is unavailable. Showing this obligation’s schedule.",
    ),
  ).toBeTruthy();
});
