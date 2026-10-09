import React from "react";
import { render, fireEvent, screen } from "@testing-library/react-native";
import { SettingsScreen } from "../src/features/settings/settings-screen";
jest.mock("../src/features/reminders/notification-service", () => ({
  clearNotifications: async () => {},
  enableNotifications: async () => {},
}));
jest.mock("expo-router", () => ({ router: { push() {} } }));
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({
    profile: {
      defaultCurrency: "PHP",
      timezone: "Asia/Manila",
      themeMode: "light",
    },
    execute: async () => {},
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
          : [],
    },
  }),
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
it("loads the selected source fields when switching edit identity and resets for a new source", async () => {
  await render(<SettingsScreen />);
  await fireEvent.press(screen.getByRole("radio", { name: "Payment sources" }));
  await fireEvent.press(screen.getAllByRole("button", { name: "Edit" })[0]);
  expect(screen.getByLabelText("Name").props.value).toBe("Cash A");
  await fireEvent.press(screen.getAllByRole("button", { name: "Edit" })[1]);
  expect(screen.getByLabelText("Name").props.value).toBe("Bank B");
  await fireEvent.press(
    screen.getByRole("button", { name: "Add payment source" }),
  );
  expect(screen.getByLabelText("Name").props.value).toBe("");
});
