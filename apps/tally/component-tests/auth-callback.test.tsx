import React from "react";
import { Platform, AccessibilityInfo } from "react-native";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import Callback from "../src/app/auth-callback";

const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
const mockContext = { session: null, error: null as string | null };
jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => mockContext,
}));
jest.mock("../src/features/auth/deep-link", () => ({
  completeAuthLink: async () => {},
}));

beforeEach(() => {
  Platform.OS = "web";
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { hash: "", pathname: "/auth-callback" },
  });
  Object.defineProperty(window, "history", {
    configurable: true,
    value: { state: null, replaceState: jest.fn() },
  });
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  mockParams = {};
  mockContext.error = null;
  mockReplace.mockClear();
});

it("replaces a failed Google callback with a safe error and a way back to sign-in", async () => {
  mockParams = {
    error: "server_error",
    error_code: "unexpected_failure",
    error_description: "Unable to exchange external code: private-test-value",
  };
  await render(<Callback />);
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.queryByText(/private-test-value/)).toBeNull();
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(mockReplace).toHaveBeenCalledWith("/auth-callback?failed=1");
  await fireEvent.press(
    screen.getByRole("button", { name: "Back to sign in" }),
  );
  expect(mockReplace).toHaveBeenCalledWith("/sign-in");
});

it("shows session restoration failures instead of waiting indefinitely", async () => {
  mockContext.error = "Could not restore your sign-in.";
  await render(<Callback />);
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("progressbar")).toBeNull();
});

it("keeps the recovery screen after the sanitized callback reloads", async () => {
  mockParams = { failed: "1" };
  await render(<Callback />);
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(mockReplace).not.toHaveBeenCalled();
});

it("recognizes a provider error supplied only in the URL fragment", async () => {
  window.location.hash = "#error=server_error&error_code=unexpected_failure";
  await render(<Callback />);
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(mockReplace).toHaveBeenCalledWith("/auth-callback?failed=1");
});

it("lets an incomplete callback recover after a bounded wait", async () => {
  jest.useFakeTimers();
  try {
    await render(<Callback />);
    await act(async () => {
      jest.advanceTimersByTime(20000);
    });
    expect(
      screen.getByRole("button", { name: "Back to sign in" }),
    ).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
