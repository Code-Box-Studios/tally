import React from "react";
import { render, fireEvent, screen } from "@testing-library/react-native";
import {
  SessionProvider,
  useSession,
} from "../src/features/auth/session-provider";
import { PaymentForm } from "../src/features/payments/payment-form";
const mockValues = new Map<string, string>();
const mockPayments = new Set<string>();
let mockId = 0;
jest.mock("expo-crypto", () => ({
  randomUUID: () => "action-" + ++mockId,
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: async () => "digest",
}));
const mockSession = { user: { id: "owner" }, access_token: "fixture" };
jest.mock("../src/core/backend/client", () => ({
  backend: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
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
    get: async (k: string) => mockValues.get(k) ?? null,
    keys: async (p: string) =>
      [...mockValues.keys()].filter((k) => k.startsWith(p)),
    set: async (k: string, v: string) => {
      mockValues.set(k, v);
    },
    atomic: async (k: string, change: (v: string | null) => string | null) => {
      const next = change(mockValues.get(k) ?? null);
      if (next === null) mockValues.delete(k);
      else mockValues.set(k, next);
      return next;
    },
  },
}));
jest.mock("../src/core/backend/repository", () => ({
  ApiError: class extends Error {},
  TallyRepository: class {
    prefix = "test:owner:";
    async profile() {
      return {
        profile: { userId: "owner", timezone: "Asia/Manila" },
        cached: false,
      };
    }
    async command(_name: string, _payload: unknown, id: string) {
      // The server committed, but its success response cannot be verified.
      mockPayments.add(id);
      return {};
    }
  },
}));
jest.mock("../src/shared/queries", () => ({
  useRecords: () => ({ data: { rows: [] } }),
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
jest.mock("../src/features/reminders/notification-service", () => ({
  clearNotifications: async () => {},
}));
function Workspace() {
  const { ready, profile } = useSession();
  return ready && profile ? (
    <PaymentForm
      obligation={{
        id: "o1",
        data: {
          currency: "PHP",
          remainingMinor: 100000,
          singleInstanceId: "i1",
          type: "loan",
        },
      }}
      onDone={() => {}}
    />
  ) : null;
}
it("keeps one committed payment when the unchanged form is submitted after an unverified success", async () => {
  await render(
    <SessionProvider>
      <Workspace />
    </SessionProvider>,
  );
  await fireEvent.changeText(
    await screen.findByLabelText("Payment amount"),
    "100",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Record payment" }));
  await screen.findByText(/Response could not be verified/);
  await fireEvent.press(screen.getByRole("button", { name: "Record payment" }));
  expect(mockPayments.size).toBe(1);
});
