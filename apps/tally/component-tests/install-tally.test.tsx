import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { InstallTallyAction } from "../src/shared/install-tally-action.web";
import { InstallTallyAction as NativeInstallTallyAction } from "../src/shared/install-tally-action";

let mockSnapshot = { platform: "iphone", installed: false, canPrompt: false };
const mockPrompt = jest.fn(async () => "dismissed");
let mockWidth = 390;
jest.mock("../src/shared/use-browser-install", () => ({
  useBrowserInstall: () => ({ ...mockSnapshot, prompt: mockPrompt }),
}));
jest.mock("../src/shared/theme", () => ({
  useTheme: () => ({
    background: "#fff",
    surface: "#fff",
    border: "#ddd",
    ink: "#111",
    primary: "#365",
    tint: "#eef",
    muted: "#555",
  }),
}));
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 844 }),
}));

beforeEach(() => {
  mockSnapshot = { platform: "iphone", installed: false, canPrompt: false };
  mockPrompt.mockClear();
  mockWidth = 390;
});

it.each([false, true])(
  "keeps homepage installation available on a computer (prompt: %s)",
  async (canPrompt) => {
    mockWidth = 1280;
    mockSnapshot = { platform: "other", installed: false, canPrompt };
    await render(<InstallTallyAction />);
    await fireEvent.press(
      screen.getByRole("button", { name: "Install Tally now" }),
    );
    expect(screen.getByText("On a computer")).toBeTruthy();
    expect(screen.getByText(/Add to Dock/)).toBeTruthy();
    expect(screen.queryByText("On iPhone")).toBeNull();
    if (canPrompt) {
      await fireEvent.press(
        screen.getByRole("button", { name: "Install on this device" }),
      );
      expect(mockPrompt).toHaveBeenCalledTimes(1);
    } else {
      expect(
        screen.queryByRole("button", { name: "Install on this device" }),
      ).toBeNull();
    }
  },
);

it("opens Apple instructions from the header and closes them with Done", async () => {
  await render(<InstallTallyAction />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Install Tally now" }),
  );
  expect(screen.getByText("On iPhone")).toBeTruthy();
  expect(screen.getByText(/Page Menu/)).toBeTruthy();
  expect(screen.getByText(/Open as Web App/)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByText("On iPhone")).toBeNull();
});

it("lets a visitor choose Android instructions", async () => {
  await render(<InstallTallyAction />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Install Tally now" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Android" }));
  expect(screen.getByText("On Android")).toBeTruthy();
  expect(screen.getByText(/Install and create shortcut/)).toBeTruthy();
  expect(
    screen.getByRole("radio", { name: "Android" }).props.accessibilityState
      .checked,
  ).toBe(true);
});

it("offers the browser install prompt when available", async () => {
  mockSnapshot = { platform: "android", installed: false, canPrompt: true };
  await render(<InstallTallyAction />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Install Tally now" }),
  );
  expect(
    screen.getByRole("button", { name: "Install on this device" }),
  ).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "Install on this device" }),
  );
  expect(screen.getByText("On Android")).toBeTruthy();
});

it("hides the action when the browser runs Tally as an installed app", async () => {
  mockSnapshot = { platform: "iphone", installed: true, canPrompt: false };
  await render(<InstallTallyAction />);
  expect(
    screen.queryByRole("button", { name: "Install Tally now" }),
  ).toBeNull();
});

it("hides the action in the native app", async () => {
  await render(<NativeInstallTallyAction />);
  expect(
    screen.queryByRole("button", { name: "Install Tally now" }),
  ).toBeNull();
});
