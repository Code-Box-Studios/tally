import { expect, it } from "vitest";
import { MemoryStore } from "../src/features/sync/data/memory-store";
import { CommandQueue } from "../src/features/sync/data/command-queue";
const owner = "owner-a";
it("freezes payload and retries the same id after an ambiguous response", async () => {
  const store = new MemoryStore();
  let attempts = 0;
  const ids: string[] = [];
  const input = {
    amountMinor: 500000,
    obligationId: "o1",
    obligationInstanceId: "i1",
  };
  const queue = new CommandQueue(
    store,
    owner,
    "local",
    () => true,
    async (command) => {
      ids.push(command.id);
      if (++attempts === 1)
        throw Object.assign(new Error("Offline"), { retryable: true });
      return {
        obligationId: "o1",
        obligationInstanceId: "i1",
        paymentId: "p1",
        obligationRevision: 2,
        instanceRevision: 2,
      };
    },
  );
  const command = await queue.enqueue("recordPayment", input);
  input.amountMinor = 1;
  await queue.flush();
  expect((await queue.list())[0].payload.amountMinor).toBe(500000);
  await queue.flush();
  expect(ids).toEqual([command.id, command.id]);
  expect((await queue.list())[0].status).toBe("synced");
});
it("fences an owner switch during dispatch", async () => {
  let active = true;
  const store = new MemoryStore();
  const queue = new CommandQueue(
    store,
    owner,
    "local",
    () => active,
    async () => {
      active = false;
      return {
        obligationId: "o1",
        obligationInstanceId: "i1",
        paymentId: "p1",
        obligationRevision: 2,
        instanceRevision: 2,
      };
    },
  );
  await queue.enqueue("recordPayment", {});
  await queue.flush();
  expect((await store.all())[0].status).not.toBe("synced");
});
it("isolates another owner and environment", async () => {
  const store = new MemoryStore();
  const a = new CommandQueue(
    store,
    owner,
    "local",
    () => true,
    async () => ({ id: "1" }),
  );
  await a.enqueue("saveCatalog", {});
  const b = new CommandQueue(
    store,
    "owner-b",
    "local",
    () => true,
    async () => ({}),
  );
  const staging = new CommandQueue(
    store,
    owner,
    "staging",
    () => true,
    async () => ({}),
  );
  expect(await b.list()).toEqual([]);
  expect(await staging.list()).toEqual([]);
});
it("does not acknowledge an unverified response", async () => {
  const store = new MemoryStore();
  const q = new CommandQueue(
    store,
    owner,
    "local",
    () => true,
    async () => ({}),
  );
  await q.enqueue("recordPayment", {});
  await q.flush();
  expect((await q.list())[0].status).toBe("review");
});
it("serializes repeated flushes", async () => {
  const store = new MemoryStore();
  let calls = 0;
  const q = new CommandQueue(
    store,
    owner,
    "local",
    () => true,
    async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return {
        obligationId: "o1",
        obligationInstanceId: "i1",
        paymentId: "p",
        obligationRevision: 2,
        instanceRevision: 2,
      };
    },
  );
  await q.enqueue("recordPayment", {});
  await Promise.all([q.flush(), q.flush(), q.flush()]);
  expect(calls).toBe(1);
});
