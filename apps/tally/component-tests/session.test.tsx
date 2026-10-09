import React from "react";
import { Text } from "react-native";
import { render, screen, act } from "@testing-library/react-native";
import {
  SessionProvider,
  useSession,
} from "../src/features/auth/session-provider";
const mockSession = { user: { id: "owner" }, access_token: "fixture" };
let mockListener: (event: string, session: unknown) => void;
jest.mock("../src/core/backend/client", () => ({
  backend: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      onAuthStateChange: (listener: typeof mockListener) => {
        mockListener = listener;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      startAutoRefresh() {},
      stopAutoRefresh() {},
    },
  }),
}));
jest.mock("../src/core/config", () => ({
  runtimeConfig: () => ({ namespace: "test" }),
}));
jest.mock("../src/core/storage", () => ({
  privateStore: {
    get: async () => null,
    keys: async () => [],
    set: async () => {},
  },
}));
jest.mock("../src/core/backend/repository", () => ({
  ApiError: class extends Error {},
  TallyRepository: class {
    prefix = "test:owner:";
    async profile() {
      return {
        profile: { userId: "owner", onboardingComplete: true },
        cached: false,
      };
    }
    command() {}
  },
}));
jest.mock("../src/features/reminders/notification-service", () => ({
  clearNotifications: async () => {},
}));
let mockContext: ReturnType<typeof useSession>;
const mockRenders: string[] = [];
function Probe() {
  mockContext = useSession();
  const { ready, profile } = mockContext;
  mockRenders.push(ready && profile ? "ready" : "loading");
  return <Text>{ready && profile ? "ready" : "loading"}</Text>;
}
it("keeps the loaded workspace usable when the same owner receives a refreshed token", async () => {
  await render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  expect(await screen.findByText("ready")).toBeTruthy();
  await act(() => {
    mockListener("TOKEN_REFRESHED", {
      ...mockSession,
      access_token: "new-fixture",
    });
  });
  expect(screen.getByText("ready")).toBeTruthy();
});

it("retains the loaded owner profile while replacing offline storage trust", async () => {
  await render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await screen.findByText("ready");
  mockRenders.length = 0;
  await act(async () => {
    await mockContext.setTrust(true);
  });
  expect(mockRenders).not.toContain("loading");
});
