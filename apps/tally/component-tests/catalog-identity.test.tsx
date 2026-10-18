import React from "react";
import {
  render,
  fireEvent,
  screen,
  within,
} from "@testing-library/react-native";
import { SettingsScreen } from "../src/features/settings/settings-screen";
jest.mock("../src/features/reminders/notification-service", () => ({
  clearNotifications: async () => {},
  clearInactiveLocalNotifications: async () => {},
  clearLocalNotifications: async () => {},
  enableNotifications: async () => {},
}));
let mockTab: string | undefined;
const mockExecute = jest.fn(async () => ({
  status: "synced",
  result: { id: "saved", revision: 2 },
}));
jest.mock("expo-router", () => ({
  router: { push() {} },
  useLocalSearchParams: () => ({ tab: mockTab }),
}));
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({
    profile: {
      defaultCurrency: "PHP",
      timezone: "Asia/Manila",
      themeMode: "light",
    },
    execute: mockExecute,
  }),
}));
jest.mock("../src/shared/queries", () => ({
  useRecords: (collection: string) => ({
    data: {
      rows:
        collection === "paymentSources"
          ? [
              { id: "a", data: { name: "Cash A", type: "cash", revision: 1 } },
              {
                id: "b",
                data: { name: "Bank B", type: "bankAccount", revision: 1 },
              },
            ]
          : [
              {
                id: "category",
                data: {
                  name: "Custom category",
                  active: true,
                  revision: 1,
                  iconKey: "gift",
                },
              },
            ],
    },
  }),
}));
beforeEach(() => {
  mockTab = undefined;
  mockExecute.mockClear();
});
jest.mock("../src/shared/theme", () => ({
  useAppearance: () => ({
    mode: "light",
    setMode: () => {},
    saveBusy: false,
    beginSave: () => true,
    finishSave: () => {},
  }),
  useTheme: () => ({
    surface: "#fff",
    ink: "#111",
    muted: "#555",
    border: "#ddd",
    primary: "#365",
    background: "#fff",
  }),
}));
it("loads the selected source fields when switching edit identity and resets for a new source", async () => {
  await render(<SettingsScreen />);
  await fireEvent.press(screen.getByRole("radio", { name: "Payment sources" }));
  await fireEvent.press(screen.getAllByRole("button", { name: "Edit" })[0]);
  expect(screen.getByLabelText("Name").props.value).toBe("Cash A");
  await fireEvent.changeText(screen.getByLabelText("Name"), "Unsaved cash");
  await fireEvent.press(screen.getByRole("button", { name: "Close dialog" }));
  await fireEvent.press(screen.getAllByRole("button", { name: "Edit" })[1]);
  expect(screen.getByLabelText("Name").props.value).toBe("Bank B");
  await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  await fireEvent.press(
    screen.getByRole("button", { name: "Add payment source" }),
  );
  expect(screen.getByLabelText("Name").props.value).toBe("");
  expect(mockExecute).not.toHaveBeenCalled();
});
it("opens category management directly from the category picker link", async () => {
  mockTab = "categories";
  await render(<SettingsScreen />);
  expect(
    screen.getByRole("radio", { name: "Categories" }).props.accessibilityState
      .checked,
  ).toBe(true);
  expect(screen.getByRole("button", { name: "Add category" })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByLabelText("Category name").props.value).toBe(
    "Custom category",
  );
  expect(
    screen.getByRole("radio", { name: "Gift icon" }).props.accessibilityState
      .checked,
  ).toBe(true);
});
it("saves source edits and returns to payment source management", async () => {
  mockTab = "sources";
  await render(<SettingsScreen />);
  await fireEvent.press(screen.getAllByRole("button", { name: "Edit" })[1]);
  await fireEvent.changeText(screen.getByLabelText("Name"), "Daily bank");
  await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  expect(mockExecute).toHaveBeenCalledWith(
    "saveCatalog",
    expect.objectContaining({
      kind: "source",
      id: "b",
      expectedRevision: 1,
      values: expect.objectContaining({
        name: "Daily bank",
        type: "bankAccount",
      }),
    }),
  );
  expect(screen.queryByRole("button", { name: "Close dialog" })).toBeNull();
  expect(
    screen.getByRole("radio", { name: "Payment sources" }).props
      .accessibilityState.checked,
  ).toBe(true);
});
it("discards category edits on dismissal and resets for a new category", async () => {
  mockTab = "categories";
  await render(<SettingsScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Edit" }));
  await fireEvent.changeText(screen.getByLabelText("Category name"), "Draft");
  await fireEvent.press(
    screen.getByRole("button", {
      name: "Dismiss dialog",
      includeHiddenElements: true,
    }),
  );
  expect(
    screen.getByRole("radio", { name: "Categories" }).props.accessibilityState
      .checked,
  ).toBe(true);
  await fireEvent.press(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByLabelText("Category name").props.value).toBe(
    "Custom category",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  await fireEvent.press(screen.getByRole("button", { name: "Add category" }));
  expect(screen.getByLabelText("Category name").props.value).toBe("");
  expect(mockExecute).not.toHaveBeenCalled();
});
it("adds a category and closes its dialog after saving", async () => {
  mockTab = "categories";
  await render(<SettingsScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Add category" }));
  await fireEvent.changeText(screen.getByLabelText("Category name"), "Travel");
  await fireEvent.press(screen.getByRole("radio", { name: "Gift icon" }));
  await fireEvent.press(
    within(screen.getByTestId("tally-form")).getByRole("button", {
      name: "Add category",
    }),
  );
  expect(mockExecute).toHaveBeenCalledWith("saveCatalog", {
    kind: "category",
    id: null,
    expectedRevision: null,
    values: { name: "Travel", active: true, iconKey: "gift" },
  });
  expect(screen.queryByRole("button", { name: "Close dialog" })).toBeNull();
  expect(screen.queryByLabelText("Category name")).toBeNull();
  expect(screen.getByRole("button", { name: "Add category" })).toBeTruthy();
});
