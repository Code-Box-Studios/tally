import { clearNotifications } from "../src/features/reminders/notification-service.native";
import type { TallyRepository } from "../src/core/backend/repository";
const mockValues = new Map<string, string>();
const mockCancel = jest.fn(async (_id: string) => {});
jest.mock("expo-notifications", () => ({
  setNotificationHandler() {},
  cancelScheduledNotificationAsync: (id: string) => mockCancel(id),
}));
jest.mock("../src/core/storage", () => ({
  privateStore: {
    get: async (k: string) => mockValues.get(k) ?? null,
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
