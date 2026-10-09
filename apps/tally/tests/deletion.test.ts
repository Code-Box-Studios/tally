import { expect, it } from "vitest";
import { DeletionCoordinator } from "../src/features/accounts/deletion-coordinator";
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
