import React, { useState } from "react";
import { Text, useColorScheme } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AppearanceControl } from "../src/shared/appearance-control";
import { SettingsScreen } from "../src/features/settings/settings-screen";
import { ThemeProvider, useTheme, useAppearance } from "../src/shared/theme";

const initial = {
  userId: "owner",
  revision: 1,
  defaultCurrency: "PHP",
  timezone: "Asia/Manila",
  themeMode: "system",
  onboardingComplete: true,
};
const mockUpdate = jest.fn(async (profile, changes) => ({
  ...profile,
  ...changes,
  revision: profile.revision + 1,
}));
const mockUseSession = jest.fn();
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => mockUseSession(),
}));
jest.mock("expo-crypto", () => ({ randomUUID: () => "appearance-command" }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: async () => {},
}));
jest.mock("../src/shared/queries", () => ({
  useRecords: () => ({ data: { rows: [] }, isPending: false }),
}));
jest.mock("../src/features/people/catalog-form", () => ({
  CatalogForm: () => null,
}));
jest.mock("../src/features/reminders/preferences-form", () => ({
  PreferencesForm: () => null,
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

function Probe() {
  const theme = useTheme(),
    { mode } = useAppearance(),
    system = useColorScheme();
  return (
    <Text testID="theme-value">{`${mode}/${theme.isDark ? "dark" : "light"}/${system}`}</Text>
  );
}
beforeEach(() => {
  mockUpdate.mockClear();
  let current: typeof initial | null = initial;
  const subscribers = new Set<
    React.Dispatch<React.SetStateAction<typeof initial | null>>
  >();
  mockUseSession.mockImplementation(function useMockSession() {
    const [profile, set] = useState(current);
    subscribers.add(set);
    return {
      profile,
      repo: { updateProfile: mockUpdate },
      setProfile: (next: typeof initial) => {
        current = next;
        subscribers.forEach((fn) => fn(next));
      },
    };
  });
});

it("saves an authenticated appearance change and updates the whole theme", async () => {
  await render(
    <ThemeProvider>
      <AppearanceControl inline />
      <Probe />
    </ThemeProvider>,
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Dark" }));
  expect(mockUpdate).toHaveBeenCalledWith(
    initial,
    {
      defaultCurrency: "PHP",
      timezone: "Asia/Manila",
      onboardingComplete: true,
      themeMode: "dark",
    },
    "appearance-command",
  );
  expect(screen.getByTestId("theme-value").props.children).toMatch(
    /^dark\/dark/,
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Light" }));
  expect(screen.getByTestId("theme-value").props.children).toMatch(
    /^light\/light/,
  );
  await fireEvent.press(screen.getByRole("radio", { name: "System" }));
  const [mode, resolved, system] = screen
    .getByTestId("theme-value")
    .props.children.split("/");
  expect(mode).toBe("system");
  expect(resolved).toBe(system === "dark" ? "dark" : "light");
});

it("keeps the current appearance and shows an error when saving fails", async () => {
  mockUpdate.mockRejectedValueOnce(new Error("Unable to save appearance."));
  await render(
    <ThemeProvider>
      <AppearanceControl inline />
      <Probe />
    </ThemeProvider>,
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Dark" }));
  expect(await screen.findByText("Unable to save appearance.")).toBeTruthy();
  expect(screen.getByTestId("theme-value").props.children).toMatch(/^system\//);
});

it("allows appearance changes before signing in without sending account writes", async () => {
  mockUseSession.mockImplementation(() => ({ profile: null }));
  await render(
    <ThemeProvider>
      <AppearanceControl inline />
      <Probe />
    </ThemeProvider>,
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Dark" }));
  expect(screen.getByTestId("theme-value").props.children).toMatch(
    /^dark\/dark/,
  );
  expect(mockUpdate).not.toHaveBeenCalled();
});

it("serializes appearance and preferences saves using the updated profile revision", async () => {
  let complete!: (value: typeof initial) => void;
  mockUpdate.mockImplementationOnce(
    () =>
      new Promise<typeof initial>((resolve) => {
        complete = resolve;
      }),
  );
  await render(
    <ThemeProvider>
      <SettingsScreen />
    </ThemeProvider>,
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Dark" }));
  await fireEvent.press(
    screen.getByRole("button", { name: "Save preferences" }),
  );
  expect(mockUpdate).toHaveBeenCalledTimes(1);
  await act(() => complete({ ...initial, revision: 2, themeMode: "dark" }));
  await fireEvent.press(
    screen.getByRole("button", { name: "Save preferences" }),
  );
  expect(mockUpdate).toHaveBeenCalledTimes(2);
  expect(mockUpdate.mock.calls[1][0]).toEqual({
    ...initial,
    revision: 2,
    themeMode: "dark",
  });
  expect(mockUpdate.mock.calls[1][1].themeMode).toBe("dark");
});
