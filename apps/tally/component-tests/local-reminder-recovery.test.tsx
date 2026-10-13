import {
  clearLocalNotifications,
  clearInactiveLocalNotifications,
  scheduleLocalReminders,
} from "../src/features/reminders/notification-service.native";
import type { TallyRepository } from "../src/core/backend/repository";
import type { Row } from "../src/core/domain/records";

const mockValues = new Map<string, string>();
const mockScheduled = new Map<string, number>();
let mockScheduleGate: Promise<void> | null = null;
let mockScheduleStarted: (() => void) | null = null;
let mockCancelFails = false;
let mockScheduleCount = 0;
let mockRemoveFails = false;
jest.mock("expo-notifications", () => ({
  setNotificationHandler() {},
  getPermissionsAsync: async () => ({ granted: true }),
  SchedulableTriggerInputTypes: { DATE: "date" },
  scheduleNotificationAsync: async (request: {
    identifier: string;
    trigger: { date: Date };
  }) => {
    mockScheduleCount++;
    mockScheduled.set(request.identifier, request.trigger.date.getTime());
    mockScheduleStarted?.();
    await mockScheduleGate;
    return request.identifier;
  },
  cancelScheduledNotificationAsync: async (id: string) => {
    if (mockCancelFails) throw new Error("Cancellation interrupted");
    mockScheduled.delete(id);
  },
}));
jest.mock("../src/core/storage", () => ({
  privateStore: {
    get: async (key: string) => mockValues.get(key) ?? null,
    set: async (key: string, value: string) => {
      mockValues.set(key, value);
    },
    remove: async (key: string) => {
      if (mockRemoveFails) throw new Error("Storage removal interrupted");
      mockValues.delete(key);
    },
    keys: async (prefix: string) =>
      [...mockValues.keys()].filter((key) => key.startsWith(prefix)),
  },
}));
const prefix = "test:owner:";
const policy = {
  enabled: true,
  localEnabled: true,
  enabledKinds: ["upcoming"],
};
const reminder = (at: string): Row => ({
  id: "reminder-one",
  data: {
    kind: "upcoming",
    status: "pending",
    scheduledAt: at,
    obligationId: "obligation-one",
  },
});
const firstTime = "2099-01-01T01:00:00Z";
const nextTime = "2099-01-01T03:00:00Z";
const repository = (check = () => {}) =>
  ({ owner: "owner", prefix, check }) as TallyRepository;
beforeEach(() => {
  mockValues.clear();
  mockScheduled.clear();
  mockScheduleGate = null;
  mockScheduleStarted = null;
  mockCancelFails = false;
  mockScheduleCount = 0;
  mockRemoveFails = false;
});

it("replaces an existing reminder when its server time changes under the same ID", async () => {
  const repo = repository();
  await scheduleLocalReminders(repo, [reminder(firstTime)], policy);
  await scheduleLocalReminders(repo, [reminder(nextTime)], policy);
  expect([...mockScheduled.values()]).toEqual([Date.parse(nextTime)]);
  await scheduleLocalReminders(repo, [reminder(nextTime)], policy);
  expect([...mockScheduled.values()]).toEqual([Date.parse(nextTime)]);
  expect(mockScheduleCount).toBe(2);
});

it("reconciles legacy identifier-only manifests against the current server time", async () => {
  mockValues.set(prefix + "local-alert:reminder-one", "legacy-alert");
  mockScheduled.set("legacy-alert", Date.parse(firstTime));
  await scheduleLocalReminders(repository(), [reminder(nextTime)], policy);
  expect(mockScheduled.has("legacy-alert")).toBe(false);
  expect([...mockScheduled.values()]).toEqual([Date.parse(nextTime)]);
});

it("cancels an in-flight old-owner schedule before cleanup completes", async () => {
  let active = true;
  let release!: () => void;
  mockScheduleGate = new Promise((resolve) => (release = resolve));
  const started = new Promise<void>(
    (resolve) => (mockScheduleStarted = resolve),
  );
  mockValues.set("test:other:local-alert:other", "other-alert");
  mockScheduled.set("other-alert", Date.parse(firstTime));
  const scheduling = scheduleLocalReminders(
    repository(() => {
      if (!active) throw new Error("Your sign-in changed.");
    }),
    [reminder(firstTime)],
    policy,
  );
  await started;
  active = false;
  const rejected = expect(scheduling).rejects.toThrow(/sign-in changed/);
  const cleanup = clearLocalNotifications(prefix);
  release();
  await rejected;
  await cleanup;
  expect([...mockScheduled.keys()]).toEqual(["other-alert"]);
  expect([...mockValues.keys()]).toEqual(["test:other:local-alert:other"]);
});

it("cleans a schedule whose process stopped before saving its final fingerprint", async () => {
  mockValues.set(
    prefix + "local-alert:reminder-one",
    JSON.stringify({ id: "interrupted-alert", fingerprint: null }),
  );
  mockScheduled.set("interrupted-alert", Date.parse(firstTime));
  await clearLocalNotifications(prefix);
  expect(mockScheduled.size).toBe(0);
  expect(mockValues.size).toBe(0);
});

it("retains cleanup evidence after cancellation fails and resumes safely", async () => {
  const key = prefix + "local-alert:reminder-one";
  mockValues.set(key, "old-alert");
  mockScheduled.set("old-alert", Date.parse(firstTime));
  mockCancelFails = true;
  await expect(clearLocalNotifications(prefix)).rejects.toThrow(/interrupted/);
  expect(JSON.parse(mockValues.get(key)!).id).toBe("old-alert");
  mockCancelFails = false;
  await clearLocalNotifications(prefix);
  expect(mockValues.size).toBe(0);
  expect(mockScheduled.size).toBe(0);
});

it("recovers interrupted old-owner cleanup on restart without cancelling the active account", async () => {
  for (const owner of ["old", "current"]) {
    mockValues.set(`test:${owner}:local-alert:one`, `${owner}-alert`);
    mockScheduled.set(`${owner}-alert`, Date.parse(firstTime));
  }
  mockValues.set("other-backend:old:local-alert:one", "other-backend-alert");
  mockScheduled.set("other-backend-alert", Date.parse(firstTime));
  mockValues.set("test:old:profile", "keep-financial-cache");
  await clearInactiveLocalNotifications("test", () => "current");
  expect([...mockScheduled.keys()]).toEqual([
    "current-alert",
    "other-backend-alert",
  ]);
  expect(mockValues.get("test:old:profile")).toBe("keep-financial-cache");
  await clearInactiveLocalNotifications("test", () => null);
  expect([...mockScheduled.keys()]).toEqual(["other-backend-alert"]);
});

it("rechecks the active owner before queued restart cleanup", async () => {
  mockValues.set("test:current:local-alert:one", "current-alert");
  mockScheduled.set("current-alert", Date.parse(firstTime));
  let owner: string | null = null;
  const cleaning = clearInactiveLocalNotifications("test", () => owner);
  owner = "current";
  await cleaning;
  expect(mockScheduled.has("current-alert")).toBe(true);
});

it("does not recreate alerts after deletion cancellation while the owner is still active", async () => {
  const repo = repository();
  await scheduleLocalReminders(repo, [reminder(firstTime)], policy);
  mockValues.set(
    prefix + "deletion",
    JSON.stringify({ owner: "owner", id: "request", state: "accepted" }),
  );
  const cleanup = clearLocalNotifications(prefix);
  // A mounted reminder query can request scheduling after deletion cancellation,
  // before local Auth sign-out invalidates the repository.
  const scheduling = scheduleLocalReminders(
    repo,
    [reminder(firstTime)],
    policy,
  );
  await cleanup;
  for (const key of [...mockValues.keys()])
    if (key.startsWith(prefix) && !key.endsWith(":deletion"))
      mockValues.delete(key);
  await scheduling;
  expect(mockScheduled.size).toBe(0);
  expect(mockScheduleCount).toBe(1);
  expect(mockValues.has(prefix + "deletion")).toBe(true);
});

it("reschedules after OS cancellation succeeded but manifest removal was interrupted", async () => {
  const repo = repository();
  await scheduleLocalReminders(repo, [reminder(firstTime)], policy);
  mockRemoveFails = true;
  await expect(scheduleLocalReminders(repo, [], policy)).rejects.toThrow(
    /removal interrupted/,
  );
  expect(mockScheduled.size).toBe(0);
  mockRemoveFails = false;
  await scheduleLocalReminders(repo, [reminder(firstTime)], policy);
  expect([...mockScheduled.values()]).toEqual([Date.parse(firstTime)]);
  expect(mockScheduleCount).toBe(2);
});
