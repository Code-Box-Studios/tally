import {
  clearNotifications,
  enableNotifications,
} from "../src/features/reminders/notification-service.native";
import type { TallyRepository } from "../src/core/backend/repository";
const mockValues = new Map<string, string>();
const mockCancel = jest.fn(async (_id: string) => {});
jest.mock("expo-notifications", () => ({
  setNotificationHandler() {},
  requestPermissionsAsync: async () => ({ granted: true }),
  cancelScheduledNotificationAsync: (id: string) => mockCancel(id),
}));
jest.mock("../src/core/storage", () => ({
  privateStore: {
    get: async (k: string) => mockValues.get(k) ?? null,
    set: async (k: string, v: string) => {
      mockValues.set(k, v);
    },
    remove: async (k: string) => {
      mockValues.delete(k);
    },
    keys: async (p: string) =>
      [...mockValues.keys()].filter((k) => k.startsWith(p)),
  },
}));
it("recovers logout after a lost unregister response without using a stale revision", async () => {
  mockValues.clear();
  mockValues.set(
    "owner:notification-device",
    JSON.stringify({ userId: "owner", installationId: "device", revision: 1 }),
  );
  mockValues.set("owner:local-alert:one", "notification-one");
  mockValues.set("other:local-alert:two", "notification-two");
  const command = jest.fn(async (name: string) => {
    if (name === "listNotificationDevices")
      return {
        devices: [
          {
            userId: "owner",
            installationId: "device",
            revision: 2,
            active: false,
          },
        ],
        nextCursor: null,
      };
    throw new Error("A stale unregister must not be resent.");
  });
  const repo = {
    owner: "owner",
    prefix: "owner:",
    check() {},
    command,
  } as unknown as TallyRepository;
  await clearNotifications(repo);
  expect(mockValues.has("owner:notification-device")).toBe(false);
  expect(mockValues.has("other:local-alert:two")).toBe(true);
  expect(mockCancel).toHaveBeenCalledWith("notification-one");
  expect(command).not.toHaveBeenCalledWith(
    "unregisterNotificationDevice",
    expect.anything(),
    expect.anything(),
  );
});

it("unregisters a first registration committed before its response was lost", async () => {
  mockValues.clear();
  let active = false;
  let installationId = "";
  const repo = {
    owner: "owner",
    prefix: "owner:",
    namespace: "app",
    check() {},
    async command(name: string, payload: Record<string, unknown>) {
      if (name === "listNotificationDevices")
        return {
          devices: active
            ? [{ userId: "owner", installationId, revision: 1, active }]
            : [],
          nextCursor: null,
        };
      if (name === "registerNotificationDevice") {
        installationId = String(payload.installationId);
        active = true;
        throw new Error("Lost response after commit");
      }
      if (name === "unregisterNotificationDevice") {
        active = false;
        return {};
      }
      throw new Error("Unexpected command");
    },
  } as unknown as TallyRepository;
  await expect(enableNotifications(repo, false)).rejects.toThrow(
    "Lost response",
  );
  await clearNotifications(repo);
  expect(active).toBe(false);
});
