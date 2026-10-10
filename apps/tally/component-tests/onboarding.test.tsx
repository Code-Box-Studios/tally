import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { OnboardingScreen } from "../src/features/auth/onboarding-screen";

const mockUpdate = jest.fn(async (_profile, changes) => ({
  ...changes,
  userId: "owner",
}));
const mockSetProfile = jest.fn();
jest.mock("expo-crypto", () => ({
  randomUUID: () => "2bf8b7dc-a03b-4b94-99f8-179d9b105bd3",
}));
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({
    profile: {
      userId: "owner",
      defaultCurrency: "PHP",
      timezone: "Asia/Manila",
      themeMode: "system",
    },
    repo: { updateProfile: mockUpdate },
    setProfile: mockSetProfile,
  }),
}));

beforeEach(() => {
  mockUpdate.mockClear();
  mockSetProfile.mockClear();
});

it("saves the selected currency and timezone before opening the workspace", async () => {
  await render(<OnboardingScreen />);
  await fireEvent.press(screen.getByRole("radio", { name: /USD/ }));
  await fireEvent.changeText(
    screen.getByLabelText("Timezone"),
    "America/New_York",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Open my workspace" }),
  );
  expect(mockUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "owner" }),
    expect.objectContaining({
      defaultCurrency: "USD",
      timezone: "America/New_York",
      onboardingComplete: true,
    }),
    expect.any(String),
  );
  expect(mockSetProfile).toHaveBeenCalledWith(
    expect.objectContaining({
      defaultCurrency: "USD",
      onboardingComplete: true,
    }),
  );
});

it("explains an invalid timezone without sending profile changes", async () => {
  await render(<OnboardingScreen />);
  await fireEvent.changeText(
    screen.getByLabelText("Timezone"),
    "Unknown/Place",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Open my workspace" }),
  );
  expect(await screen.findByText(/valid timezone/i)).toBeTruthy();
  expect(mockUpdate).not.toHaveBeenCalled();
});
