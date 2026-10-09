import { expect, it } from "vitest";
import { CommandQueue } from "../src/features/sync/data/command-queue";
import { MemoryStore } from "../src/features/sync/data/memory-store";
it("allows discarding only a definitively rejected action and keeps its history", async () => {
  const q = new CommandQueue(
    new MemoryStore(),
    "owner",
    "env",
    () => true,
    async () => {
      throw Object.assign(new Error("Changed"), { code: "aborted" });
    },
  );
  const c = await q.enqueue("recordPayment", {});
  await q.flush();
  await q.discard(c.id);
  expect((await q.list())[0].status).toBe("discarded");
  expect((await q.list())[0].error).toBe("Changed");
});
it("never discards an ambiguous successful financial response", async () => {
  const q = new CommandQueue(
    new MemoryStore(),
    "owner",
    "env",
    () => true,
    async () => ({}),
  );
  const c = await q.enqueue("recordPayment", {});
  await q.flush();
  await expect(q.discard(c.id)).rejects.toThrow();
});
