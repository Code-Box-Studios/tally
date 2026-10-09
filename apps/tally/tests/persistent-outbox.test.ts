import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { privateStore } from "../src/core/storage/index.web";
import { PersistentCommandStore } from "../src/features/sync/data/persistent-store";
import { CommandQueue } from "../src/features/sync/data/command-queue";
const receipt = {
  obligationId: "o1",
  obligationInstanceId: "i1",
  paymentId: "p1",
  obligationRevision: 2,
  instanceRevision: 2,
};
it("recovers a real IndexedDB pending payment after app restart", async () => {
  const prefix = "restart:";
  const first = new CommandQueue(
    new PersistentCommandStore(privateStore, prefix),
    "owner",
    "env",
    () => true,
    async () => {
      throw Object.assign(new Error("Offline"), { retryable: true });
    },
  );
  const c = await first.enqueue("recordPayment", {
    obligationId: "o1",
    obligationInstanceId: "i1",
    amountMinor: 2000,
  });
  await first.flush();
  const restored = new CommandQueue(
    new PersistentCommandStore(privateStore, prefix),
    "owner",
    "env",
    () => true,
    async (item) => {
      expect(item.id).toBe(c.id);
      expect(item.payload.amountMinor).toBe(2000);
      return receipt;
    },
  );
  await restored.flush();
  expect((await restored.list())[0].status).toBe("synced");
});
it("leases a shared browser payment once across two queues", async () => {
  const prefix = "tabs:";
  let calls = 0;
  const send = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return receipt;
  };
  const a = new CommandQueue(
    new PersistentCommandStore(privateStore, prefix),
    "owner",
    "env",
    () => true,
    send,
  );
  const b = new CommandQueue(
    new PersistentCommandStore(privateStore, prefix),
    "owner",
    "env",
    () => true,
    send,
  );
  await a.enqueue("recordPayment", {
    obligationId: "o1",
    obligationInstanceId: "i1",
  });
  await Promise.all([a.flush(), b.flush()]);
  expect(calls).toBe(1);
  expect((await b.list())[0].status).toBe("synced");
});

it("prunes completed device history after 1000 actions while preserving unresolved payments", async () => {
  const prefix = "retention:";
  for (let i = 0; i < 1000; i++) {
    await privateStore.set(
      prefix + "old-" + i,
      JSON.stringify({
        id: "old-" + i,
        owner: "owner",
        environment: "env",
        schema: 1,
        name: "recordPayment",
        payload: {},
        status: i === 0 ? "review" : "synced",
        createdAt: new Date(i).toISOString(),
        leaseUntil: 0,
        error: null,
        result: null,
      }),
    );
  }
  const queue = new CommandQueue(
    new PersistentCommandStore(privateStore, prefix),
    "owner",
    "env",
    () => true,
    async () => receipt,
  );
  const current = await queue.enqueue("recordPayment", {
    obligationId: "o1",
    obligationInstanceId: "i1",
  });
  await queue.flush();
  const saved = await queue.list();
  expect(saved.find((c) => c.id === current.id)?.status).toBe("synced");
  expect(saved.find((c) => c.id === "old-0")?.status).toBe("review");
  expect(saved.length).toBeLessThanOrEqual(1000);
});

it("rejects capacity before saving a new action and keeps existing pending actions recoverable", async () => {
  const prefix = "pending-capacity:";
  for (let i = 0; i < 1000; i++)
    await privateStore.set(
      prefix + "pending-" + i,
      JSON.stringify({
        id: "pending-" + i,
        owner: "owner",
        environment: "env",
        schema: 1,
        name: "recordPayment",
        payload: {},
        status: "pending",
        createdAt: new Date(i).toISOString(),
        leaseUntil: 0,
        error: null,
        result: null,
      }),
    );
  const queue = new CommandQueue(
    new PersistentCommandStore(privateStore, prefix),
    "owner",
    "env",
    () => true,
    async () => receipt,
  );
  await expect(queue.enqueue("recordPayment", {})).rejects.toThrow(
    /Sync or review/,
  );
  expect((await queue.list()).length).toBe(1000);
  expect((await privateStore.keys(prefix)).length).toBe(1000);
});
