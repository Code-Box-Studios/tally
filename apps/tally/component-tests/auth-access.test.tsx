import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AuthScreen } from "../src/features/auth/auth-screen";
import { ThemeProvider } from "../src/shared/theme";

const mockReset = jest.fn(async () => ({ error: null }));
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({ profile: null, google: async () => {} }),
}));
jest.mock("../src/core/backend/client", () => ({
  backend: () => ({ auth: { resetPasswordForEmail: mockReset } }),
}));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: async () => {},
}));

it("opens password reset from sign-in and returns without losing the entered email", async () => {
  await render(
    <ThemeProvider>
      <AuthScreen />
    </ThemeProvider>,
  );
  await fireEvent.changeText(
    screen.getByLabelText("Email"),
    "owner@example.test",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Reset password" }));
  expect(screen.queryByLabelText("Password")).toBeNull();
  expect(screen.getByLabelText("Email").props.value).toBe("owner@example.test");
  await fireEvent.press(
    screen.getByRole("button", { name: "Back to sign in" }),
  );
  expect(screen.getByLabelText("Password")).toBeTruthy();
  expect(screen.getByLabelText("Email").props.value).toBe("owner@example.test");
});

it("does not submit a reset request with an invalid email", async () => {
  mockReset.mockClear();
  await render(
    <ThemeProvider>
      <AuthScreen />
    </ThemeProvider>,
  );
  await fireEvent.press(screen.getByRole("button", { name: "Reset password" }));
  await fireEvent.changeText(screen.getByLabelText("Email"), "invalid");
  await fireEvent.press(
    screen.getByRole("button", { name: "Send reset link" }),
  );
  expect(await screen.findByText("Enter a valid email.")).toBeTruthy();
  expect(mockReset).not.toHaveBeenCalled();
});
