import { expect, it } from "vitest";
import {
  DeletionCoordinator,
  resumeAcceptedDeletions,
} from "../src/features/accounts/deletion-coordinator";
const values = new Map<string, string>();
const store = {
  get: async (k: string) => values.get(k) ?? null,
  set: async (k: string, v: string) => {
    values.set(k, v);
  },
  remove: async (k: string) => {
    values.delete(k);
  },
};
const recoveryStore = {
  ...store,
  keys: async (prefix: string) =>
    [...values.keys()].filter((key) => key.startsWith(prefix)),
};
it("persists the same request identity through an ambiguous deletion response", async () => {
  values.clear();
  const ids: string[] = [];
  let calls = 0;
  const d = new DeletionCoordinator(
    store,
    "owner-key",
    "owner",
    () => true,
    async (id) => {
      ids.push(id);
      if (++calls === 1) throw new Error("Connection lost");
      return { userId: "owner", status: "pending" };
    },
    async () => {},
    () => "request-1",
  );
  await expect(d.request()).rejects.toThrow();
  await d.request();
  expect(ids).toEqual(["request-1", "request-1"]);
});
it("does not erase financial data when the server rejects deletion", async () => {
  values.clear();
  let cleaned = false;
  const d = new DeletionCoordinator(
    store,
    "key",
    "owner",
    () => true,
    async () => ({ userId: "another", status: "pending" }),
    async () => {
      cleaned = true;
    },
    () => "id",
  );
  await expect(d.request()).rejects.toThrow();
  expect(cleaned).toBe(false);
});
it("resumes accepted local cleanup without another server request", async () => {
  values.clear();
  values.set(
    "key",
    JSON.stringify({ owner: "owner", id: "request", state: "accepted" }),
  );
  let cleaned = false;
  const d = new DeletionCoordinator(
    store,
    "key",
    "owner",
    () => true,
    async () => {
      throw new Error("Must not send");
    },
    async () => {
      cleaned = true;
    },
  );
  await d.request();
  expect(cleaned).toBe(true);
  expect(values.has("key")).toBe(false);
});
it("unblocks the account after a definitive recent-login rejection", async () => {
  values.clear();
  const d = new DeletionCoordinator(
    store,
    "key",
    "owner",
    () => true,
    async () => {
      throw Object.assign(new Error("Sign in again"), {
        code: "failed-precondition",
      });
    },
    async () => {},
  );
  await expect(d.request()).rejects.toThrow();
  expect(values.has("key")).toBe(false);
});

it("recovers only accepted deletions in this backend without a session", async () => {
  values.clear();
  for (const [prefix, state] of [
    ["test:deleted:", "accepted"],
    ["test:current:", "pending"],
    ["other:deleted:", "accepted"],
  ]) {
    values.set(
      prefix + "deletion",
      JSON.stringify({
        owner: prefix.split(":")[1],
        id: "request",
        state,
      }),
    );
    values.set(prefix + "profile", "private");
  }
  const cleaned: string[] = [];
  expect(
    await resumeAcceptedDeletions(
      recoveryStore,
      "test",
      async (owner, prefix, key) => {
        cleaned.push(owner);
        for (const entry of await recoveryStore.keys(prefix))
          if (entry !== key) await recoveryStore.remove(entry);
      },
    ),
  ).toEqual(["deleted"]);
  expect(cleaned).toEqual(["deleted"]);
  expect(values.has("test:deleted:profile")).toBe(false);
  expect(values.has("test:deleted:deletion")).toBe(false);
  expect(values.has("test:current:profile")).toBe(true);
  expect(values.has("test:current:deletion")).toBe(true);
  expect(values.has("other:deleted:profile")).toBe(true);
});

it("retains accepted deletion evidence when cleanup is interrupted and retries it", async () => {
  values.clear();
  const key = "test:deleted:deletion";
  values.set(
    key,
    JSON.stringify({ owner: "deleted", id: "request", state: "accepted" }),
  );
  await expect(
    resumeAcceptedDeletions(recoveryStore, "test", async () => {
      throw new Error("Device cancellation failed");
    }),
  ).rejects.toThrow("Device cancellation failed");
  expect(values.has(key)).toBe(true);
  await resumeAcceptedDeletions(recoveryStore, "test", async () => {});
  expect(values.has(key)).toBe(false);
});

it("does not use a mismatched deletion owner to erase another owner", async () => {
  values.clear();
  values.set(
    "test:deleted:deletion",
    JSON.stringify({ owner: "current", id: "request", state: "accepted" }),
  );
  let cleaned = false;
  await expect(
    resumeAcceptedDeletions(recoveryStore, "test", async () => {
      cleaned = true;
    }),
  ).rejects.toThrow("Deletion needs recovery");
  expect(cleaned).toBe(false);
});
