import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { privateStore } from "../src/core/storage/index.web";
import type { KeyValueStore } from "../src/core/storage/types";
it("fences another tab's persistent reads and writes after shared device trust is revoked", async () => {
  const prefix = "trust-tabs:owner:",
    trust = prefix + "trust";
  await privateStore.set(trust, "true");
  const olderTab: KeyValueStore = privateStore.guard?.(trust) ?? privateStore;
  await olderTab.set(prefix + "cache:profile", "private snapshot");
  if (privateStore.revokeTrust) await privateStore.revokeTrust(prefix);
  else {
    await privateStore.set(trust, "false");
    for (const k of await privateStore.keys(prefix))
      if (k !== trust) await privateStore.remove(k);
  }
  await expect(
    olderTab.set(prefix + "cache:profile", "stale response"),
  ).rejects.toThrow();
  await expect(
    olderTab.atomic(prefix + "command:payment", () => "{}"),
  ).rejects.toThrow();
  await expect(olderTab.get(prefix + "cache:profile")).rejects.toThrow();
  expect(await privateStore.keys(prefix)).toEqual([trust]);
});
it("refuses atomic trust removal when another tab has just saved an unresolved payment", async () => {
  const prefix = "trust-race:owner:",
    trust = prefix + "trust";
  await privateStore.set(trust, "true");
  await privateStore.set(
    prefix + "command:p1",
    JSON.stringify({ status: "pending", amountMinor: 10000 }),
  );
  await expect(
    privateStore.revokeTrust
      ? privateStore.revokeTrust(prefix)
      : privateStore.set(trust, "false"),
  ).rejects.toThrow();
  expect(await privateStore.get(trust)).toBe("true");
  expect(await privateStore.get(prefix + "command:p1")).not.toBeNull();
});
