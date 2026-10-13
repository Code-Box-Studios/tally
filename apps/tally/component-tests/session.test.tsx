import React from "react";
import { Text } from "react-native";
import { render, screen, act, waitFor } from "@testing-library/react-native";
import {
  SessionProvider,
  queryClient,
  useSession,
} from "../src/features/auth/session-provider";
const mockSession = { user: { id: "owner" }, access_token: "fixture" };
let mockRestoredSession: typeof mockSession | null = mockSession;
const mockClearNotifications = jest.fn(async () => {});
const mockOwnedSignOut = jest.fn(
  async (owner: string, scope: "local" | "global" = "local") => {
    if (mockRestoredSession?.user.id === owner) await mockSignOut({ scope });
  },
);
const mockClearLocalNotifications = jest.fn(async (_prefix: string) => {});
const mockSignOut = jest.fn(
  async (_options?: { scope: "local" | "global" }) => {
    mockRestoredSession = null;
    mockListener?.("SIGNED_OUT", null);
    return { error: null };
  },
);
const mockValues = new Map<string, string>();
let mockCommandStatus: "synced" | "pending" | "review" = "synced";
let mockId = 0;
let mockListener: (event: string, session: unknown) => void;
jest.mock("expo-crypto", () => ({
  randomUUID: () => "action-" + ++mockId,
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: async () => "digest",
}));
jest.mock("../src/core/backend/client", () => ({
  signOutOwnedSession: (owner: string, scope: "local" | "global") =>
    mockOwnedSignOut(owner, scope),
  signOutDeletedOwner: async (owner: string) => {
    if (mockRestoredSession?.user.id === owner)
      await mockSignOut({ scope: "local" });
  },
  backend: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockRestoredSession } }),
      signOut: mockSignOut,
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
    get: async (key: string) => mockValues.get(key) ?? null,
    keys: async (prefix: string) =>
      [...mockValues.keys()].filter((key) => key.startsWith(prefix)),
    set: async (key: string, value: string) => {
      mockValues.set(key, value);
    },
    remove: async (key: string) => {
      mockValues.delete(key);
    },
    atomic: async (
      key: string,
      change: (value: string | null) => string | null,
    ) => {
      const next = change(mockValues.get(key) ?? null);
      if (next === null) mockValues.delete(key);
      else mockValues.set(key, next);
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
        profile: { userId: "owner", onboardingComplete: true },
        cached: false,
      };
    }
    async command() {
      if (mockCommandStatus === "pending")
        throw Object.assign(new Error("Connection lost"), { retryable: true });
      if (mockCommandStatus === "review") return {};
      return {
        obligationId: "o1",
        obligationInstanceId: "i1",
        paymentId: "payment-1",
        obligationRevision: 2,
        instanceRevision: 2,
      };
    }
  },
}));
jest.mock("../src/features/reminders/notification-service", () => ({
  clearNotifications: () => mockClearNotifications(),
  clearInactiveLocalNotifications: async () => {},
  clearLocalNotifications: (prefix: string) =>
    mockClearLocalNotifications(prefix),
}));
let mockContext: ReturnType<typeof useSession>;
const mockRenders: string[] = [];
beforeEach(() => {
  mockValues.clear();
  mockRestoredSession = mockSession;
  mockClearLocalNotifications.mockReset();
  mockClearLocalNotifications.mockResolvedValue(undefined);
  mockSignOut.mockClear();
  mockOwnedSignOut.mockClear();
  mockClearNotifications.mockReset();
  mockClearNotifications.mockResolvedValue(undefined);
  mockCommandStatus = "synced";
});
afterEach(() => {
  queryClient.clear();
});
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

it.each([
  { trusted: false, status: "pending" as const },
  { trusted: false, status: "review" as const },
  { trusted: true, status: "pending" as const },
  { trusted: true, status: "review" as const },
])(
  "preserves a $status payment when changing trust from $trusted",
  async ({ trusted, status }) => {
    mockValues.set("test:owner:trust", String(trusted));
    mockCommandStatus = status;
    await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await screen.findByText("ready");
    await act(async () => {
      await mockContext
        .execute("recordPayment", {
          obligationId: "o1",
          obligationInstanceId: "i1",
          amountMinor: 2000,
        })
        .catch(() => {});
    });
    const queue = mockContext.queue!;
    const [saved] = await queue.list();
    expect(saved.status).toBe(status);
    await act(async () => {
      await expect(mockContext.setTrust(!trusted)).rejects.toThrow(
        /saved actions/,
      );
    });
    expect(mockContext.trusted).toBe(trusted);
    expect(mockContext.queue).toBe(queue);
    expect(await mockContext.queue!.list()).toEqual([saved]);
  },
);

it.each([false, true])(
  "allows trust changes from %s after a payment is confirmed",
  async (trusted) => {
    mockValues.set("test:owner:trust", String(trusted));
    await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await screen.findByText("ready");
    await act(async () => {
      const saved = await mockContext.execute("recordPayment", {
        obligationId: "o1",
        obligationInstanceId: "i1",
        amountMinor: 2000,
      });
      expect(saved.status).toBe("synced");
      await mockContext.setTrust(!trusted);
    });
    expect(mockContext.trusted).toBe(!trusted);
    expect(screen.getByText("ready")).toBeTruthy();
  },
);

it.each([null, { user: { id: "another" }, access_token: "fixture" }])(
  "cancels only the previous owner's local alerts on an Auth-driven owner change: %s",
  async (next) => {
    await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await screen.findByText("ready");
    mockClearLocalNotifications.mockClear();
    await act(() => {
      mockListener(next ? "SIGNED_IN" : "SIGNED_OUT", next);
    });
    await waitFor(() =>
      expect(mockClearLocalNotifications).toHaveBeenCalledWith("test:owner:"),
    );
    expect(mockClearLocalNotifications).not.toHaveBeenCalledWith(
      "test:another:",
    );
  },
);

it.each([
  null,
  mockSession,
  { user: { id: "another" }, access_token: "fixture" },
])(
  "resumes accepted deletion before restoring a session: %s",
  async (restored) => {
    mockRestoredSession = restored;
    mockValues.set(
      "test:owner:deletion",
      JSON.stringify({ owner: "owner", id: "request", state: "accepted" }),
    );
    mockValues.set("test:owner:profile", "private");
    mockValues.set("test:another:profile", "other-private");
    mockValues.set("other-backend:owner:profile", "other-backend-private");
    await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await waitFor(() =>
      expect(mockValues.has("test:owner:deletion")).toBe(false),
    );
    expect(mockValues.has("test:owner:profile")).toBe(false);
    expect(mockValues.get("test:another:profile")).toBe("other-private");
    expect(mockValues.has("other-backend:owner:profile")).toBe(true);
    expect(mockClearLocalNotifications).toHaveBeenCalledWith("test:owner:");
    if (restored?.user.id === "owner")
      expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    else expect(mockSignOut).not.toHaveBeenCalled();
    await waitFor(() => expect(mockContext.ready).toBe(true));
    expect(mockContext.session?.user.id ?? null).toBe(
      restored?.user.id === "another" ? "another" : null,
    );
  },
);

it("keeps accepted deletion and private data recoverable after cancellation fails", async () => {
  mockRestoredSession = null;
  mockValues.set(
    "test:owner:deletion",
    JSON.stringify({ owner: "owner", id: "request", state: "accepted" }),
  );
  mockValues.set("test:owner:profile", "private");
  mockClearLocalNotifications.mockRejectedValueOnce(
    new Error("Device cancellation failed"),
  );
  const view = await render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await waitFor(() =>
    expect(mockContext.error).toBe("Device cancellation failed"),
  );
  expect(mockValues.has("test:owner:deletion")).toBe(true);
  expect(mockValues.has("test:owner:profile")).toBe(true);
  await view.unmount();
  await render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await waitFor(() =>
    expect(mockValues.has("test:owner:deletion")).toBe(false),
  );
  expect(mockValues.has("test:owner:profile")).toBe(false);
});

it("does not sign out a new owner who signs in while deleted-owner cleanup waits", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  mockValues.set(
    "test:owner:deletion",
    JSON.stringify({ owner: "owner", id: "request", state: "accepted" }),
  );
  mockClearLocalNotifications.mockImplementationOnce(async () => {
    await gate;
  });
  await render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await waitFor(() =>
    expect(mockClearLocalNotifications).toHaveBeenCalledWith("test:owner:"),
  );
  const next = { user: { id: "another" }, access_token: "fixture" };
  mockRestoredSession = next;
  await act(async () => {
    mockListener("SIGNED_IN", next);
    release();
  });
  await waitFor(() => expect(mockContext.session?.user.id).toBe("another"));
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(mockValues.has("test:owner:deletion")).toBe(false);
});

it.each([null, mockSession])(
  "retries failed startup cleanup through refresh: %s",
  async (restored) => {
    mockRestoredSession = restored;
    mockValues.set(
      "test:owner:deletion",
      JSON.stringify({ owner: "owner", id: "request", state: "accepted" }),
    );
    mockClearLocalNotifications.mockRejectedValueOnce(
      new Error("Device cancellation failed"),
    );
    await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await waitFor(() =>
      expect(mockContext.error).toBe("Device cancellation failed"),
    );
    await act(async () => {
      await mockContext.refresh();
    });
    expect(mockValues.has("test:owner:deletion")).toBe(false);
    expect(mockContext.error).toBe(null);
  },
);

it("keeps global sign-out scoped to the owner who requested it", async () => {
  await render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await screen.findByText("ready");
  await act(async () => {
    await mockContext.signOut();
  });
  expect(mockOwnedSignOut).toHaveBeenCalledWith("owner", "global");
  expect(mockSignOut).toHaveBeenCalledWith({ scope: "global" });
});

it("does not sign out a new owner after old-owner notification cleanup waits", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  mockClearNotifications.mockImplementationOnce(async () => {
    await gate;
  });
  await render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await screen.findByText("ready");
  const signingOut = mockContext.signOut();
  await waitFor(() => expect(mockClearNotifications).toHaveBeenCalled());
  const next = { user: { id: "another" }, access_token: "fixture" };
  mockRestoredSession = next;
  await act(async () => {
    mockListener("SIGNED_IN", next);
    queryClient.setQueryData(["new-owner-only"], { owner: "another" });
    release();
    await signingOut;
  });
  expect(mockOwnedSignOut).toHaveBeenCalledWith("owner", "global");
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(mockContext.session?.user.id).toBe("another");
  expect(queryClient.getQueryData(["new-owner-only"])).toEqual({
    owner: "another",
  });
});
