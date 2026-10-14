import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { privateStore } from "../src/core/storage/index.web";
import { PersistentCommandStore } from "../src/features/sync/data/persistent-store";
import { MemoryStore } from "../src/features/sync/data/memory-store";
import { CommandQueue } from "../src/features/sync/data/command-queue";

it("reuses one stable action across concurrent enqueue and restart", async () => {
  const prefix = "import-stable:";
  const make = () =>
    new CommandQueue(
      new PersistentCommandStore(privateStore, prefix),
      "owner",
      "env",
      () => true,
      async () => ({}),
    );
  const a = make(),
    b = make();
  const [first, second] = await Promise.all([
    a.enqueue(
      "createObligation",
      { title: "Loan", amountMinor: 101 },
      "import-v1-same",
    ),
    b.enqueue(
      "createObligation",
      { amountMinor: 101, title: "Loan" },
      "import-v1-same",
    ),
  ]);
  expect(first.id).toBe("import-v1-same");
  expect(second.id).toBe(first.id);
  expect(await make().list()).toHaveLength(1);
  expect(
    (await make().enqueue("createObligation", first.payload, first.id)).id,
  ).toBe(first.id);
});

it("preserves reviewed actions and refuses stable ID conflicts or owner reuse", async () => {
  const store = new MemoryStore();
  const make = (owner = "owner", environment = "env") =>
    new CommandQueue(
      store,
      owner,
      environment,
      () => true,
      async () => ({}),
    );
  const queue = make();
  const first = await queue.enqueue(
    "createObligation",
    { amountMinor: 101 },
    "import-v1-review",
  );
  await queue.flush();
  expect(
    (await queue.enqueue(first.name, first.payload, first.id)).status,
  ).toBe("review");
  await expect(
    queue.enqueue(first.name, { amountMinor: 102 }, first.id),
  ).rejects.toThrow();
  await expect(
    make("other").enqueue(first.name, first.payload, first.id),
  ).rejects.toThrow();
  await expect(
    make("owner", "other").enqueue(first.name, first.payload, first.id),
  ).rejects.toThrow();
  expect((await queue.list())[0].status).toBe("review");
});

it("allows an existing identical stable action when the queue is full", async () => {
  const store = new MemoryStore();
  const queue = new CommandQueue(
    store,
    "owner",
    "env",
    () => true,
    async () => ({}),
  );
  const first = await queue.enqueue("createObligation", {}, "import-v1-first");
  for (let i = 1; i < 1000; i++)
    await store.atomic(`filler-${i}`, () => ({ ...first, id: `filler-${i}` }));
  expect((await queue.enqueue(first.name, first.payload, first.id)).id).toBe(
    first.id,
  );
  await expect(queue.enqueue(first.name, {}, "new-action")).rejects.toThrow(
    /Sync or review/,
  );
});
