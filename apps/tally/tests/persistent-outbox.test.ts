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
