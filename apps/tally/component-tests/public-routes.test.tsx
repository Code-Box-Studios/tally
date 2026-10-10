import React from "react";
import { Text as MockText } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { AuthRoute } from "../src/features/auth/auth-route";
import Workspace from "../src/app/(workspace)/_layout";

const mockSession = jest.fn();
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => mockSession(),
}));
jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => (
    <MockText>{`Redirect: ${href}`}</MockText>
  ),
  Slot: () => <MockText>Private workspace</MockText>,
}));
jest.mock("../src/features/auth/auth-screen", () => ({
  AuthScreen: ({ initialMode }: { initialMode: string }) => (
    <MockText>{initialMode}</MockText>
  ),
}));
jest.mock("../src/features/auth/onboarding-screen", () => ({
  OnboardingScreen: () => <MockText>Account setup</MockText>,
}));
jest.mock("../src/features/reminders/notification-session", () => ({
  NotificationSession: () => null,
}));
jest.mock("../src/shared/shell", () => ({
  Shell: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock("../src/shared/ui", () => ({
  Page: ({ children }: React.PropsWithChildren) => <>{children}</>,
  Loading: () => <MockText>Loading</MockText>,
  Failure: () => <MockText>Profile failure</MockText>,
  Button: () => null,
}));

beforeEach(() =>
  mockSession.mockReturnValue({ ready: true, session: null, recovery: false }),
);

it.each(["Sign in", "Create account", "Reset password"] as const)(
  "opens the public %s form for a signed-out visitor",
  async (mode) => {
    await render(<AuthRoute mode={mode} />);
    expect(screen.getByText(mode)).toBeTruthy();
  },
);
it("sends an authenticated visitor to the private dashboard", async () => {
  mockSession.mockReturnValue({
    ready: true,
    session: { user: { id: "owner" } },
  });
  await render(<AuthRoute />);
  expect(screen.getByText("Redirect: /home")).toBeTruthy();
});
it("blocks private routes until authentication is resolved", async () => {
  mockSession.mockReturnValue({ ready: false, session: null });
  await render(<Workspace />);
  expect(screen.getByText("Loading")).toBeTruthy();
  expect(screen.queryByText("Private workspace")).toBeNull();
});
it("sends signed-out private requests to /sign-in", async () => {
  await render(<Workspace />);
  expect(screen.getByText("Redirect: /sign-in")).toBeTruthy();
});
it("keeps password recovery ahead of dashboard and authentication redirects", async () => {
  mockSession.mockReturnValue({
    ready: true,
    recovery: true,
    session: { user: { id: "owner" } },
  });
  await render(<AuthRoute />);
  expect(screen.getByText("Redirect: /reset-password")).toBeTruthy();
});
it("retains onboarding before showing private data", async () => {
  mockSession.mockReturnValue({
    ready: true,
    session: { user: { id: "owner" } },
    profile: { onboardingComplete: false },
  });
  await render(<Workspace />);
  expect(screen.getByText("Account setup")).toBeTruthy();
  expect(screen.queryByText("Private workspace")).toBeNull();
});
