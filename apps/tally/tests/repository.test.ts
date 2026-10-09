import { expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("../src/core/config", () => ({
  runtimeConfig: () => ({
    url: "http://127.0.0.1:56321",
    key: "public",
    namespace: "test",
  }),
}));
import { TallyRepository, ApiError } from "../src/core/backend/repository";
import type { KeyValueStore } from "../src/core/storage/types";
const values = new Map<string, string>();
const store: KeyValueStore = {
  get: async (k) => values.get(k) ?? null,
  set: async (k, v) => {
    values.set(k, v);
  },
  remove: async (k) => {
    values.delete(k);
  },
  keys: async (p) => [...values.keys()].filter((k) => k.startsWith(p)),
  atomic: async (k, change) => {
    const v = change(values.get(k) ?? null);
    if (v == null) values.delete(k);
    else values.set(k, v);
    return v;
  },
};
const client = {
  auth: {
    getSession: async () => ({
      data: { session: { user: { id: "owner-a" }, access_token: "fixture" } },
    }),
  },
} as unknown as SupabaseClient;
beforeEach(() => {
  values.clear();
  vi.restoreAllMocks();
});
it("does not misclassify malformed successful JSON as a network outage", async () => {
  vi.stubGlobal("fetch", async () => new Response("not JSON", { status: 200 }));
  const repo = new TallyRepository(
    client,
    "owner-a",
    store,
    async () => true,
    () => true,
    "test",
  );
  await expect(repo.invoke("test", {})).rejects.toMatchObject({
    code: "unverified",
    retryable: false,
  });
});
it("blocks late successful responses after an owner switch", async () => {
  let active = true;
  vi.stubGlobal("fetch", async () => {
    active = false;
    return Response.json({ result: { id: "x" } });
  });
  const repo = new TallyRepository(
    client,
    "owner-a",
    store,
    async () => true,
    () => active,
    "test",
  );
  await expect(repo.invoke("test", {})).rejects.toMatchObject({
    code: "unauthenticated",
  });
});
it("never falls back to private cache after authorization rejection", async () => {
  values.set(
    "test:owner-a:cache:payments",
    JSON.stringify({
      owner: "owner-a",
      namespace: "test",
      schema: 1,
      value: [],
    }),
  );
  const denied = {
    ...client,
    rpc: async () => ({ data: null, error: { code: "42501" } }),
  } as unknown as SupabaseClient;
  const repo = new TallyRepository(
    denied,
    "owner-a",
    store,
    async () => true,
    () => true,
    "test",
  );
  await expect(repo.records("payments")).rejects.toBeInstanceOf(ApiError);
});
it("restores only a trusted owner-scoped cache during network loss", async () => {
  values.set(
    "test:owner-a:cache:payments",
    JSON.stringify({
      owner: "owner-a",
      namespace: "test",
      schema: 1,
      value: [],
    }),
  );
  const offline = {
    ...client,
    rpc: async () => ({ data: null, error: { code: "" } }),
  } as unknown as SupabaseClient;
  const repo = new TallyRepository(
    offline,
    "owner-a",
    store,
    async () => true,
    () => true,
    "test",
  );
  expect(await repo.records("payments")).toEqual({ rows: [], cached: true });
  const untrusted = new TallyRepository(
    offline,
    "owner-a",
    store,
    async () => false,
    () => true,
    "test",
  );
  await expect(untrusted.records("payments")).rejects.toThrow();
});
