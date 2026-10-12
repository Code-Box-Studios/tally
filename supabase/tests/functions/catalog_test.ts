import assert from "node:assert/strict";
import {
  saveCatalog,
  validateCatalog,
} from "../../functions/tally-api/catalog/catalog.ts";
import type {
  CommandDatabase,
  Mutation,
} from "../../functions/tally-api/shared/database.ts";

const owner = "catalog-test-owner";
function category(values: Record<string, unknown>, editing = false) {
  return {
    kind: "category",
    id: editing ? "custom" : null,
    expectedRevision: editing ? 3 : null,
    values,
  };
}
function source(values: Record<string, unknown> = {}, editing = false) {
  return {
    kind: "source",
    id: editing ? "source" : null,
    expectedRevision: editing ? 3 : null,
    values: {
      name: "BDO savings",
      type: "bankAccount",
      nickname: null,
      lastFour: null,
      notes: "",
      active: true,
      ...values,
    },
  };
}
function memoryDatabase() {
  const records = new Map<string, Record<string, unknown>>([
    ["categories/custom", {
      userId: owner,
      schemaVersion: 1,
      name: "Custom",
      active: true,
      iconKey: "home",
      revision: 3,
      isDefault: false,
    }],
    ["paymentSources/source", {
      userId: owner,
      schemaVersion: 1,
      name: "BDO savings",
      type: "bankAccount",
      active: true,
      iconKey: "bank",
      providerId: "bdo",
      revision: 3,
    }],
  ]);
  const db = {
    profile: async () => ({
      data: {
        userId: owner,
        schemaVersion: 1,
        revision: 1,
        timezone: "Asia/Manila",
        accountStatus: "active",
      },
      version: 1,
    }),
    receipt: async () => null,
    read: async (_uid: string, collection: string, id: string) =>
      collection === "ledgerState"
        ? { userId: owner, schemaVersion: 1, revision: 1 }
        : records.get(`${collection}/${id}`) ?? null,
    commit: async (
      _uid: string,
      _id: string,
      _type: string,
      _hash: string,
      _version: number,
      mutations: Mutation[],
      result: unknown,
    ) => {
      for (const mutation of mutations) {
        const key = `${mutation.collection}/${mutation.id}`;
        records.set(key, { ...records.get(key), ...mutation.data });
      }
      return result;
    },
  } as unknown as CommandDatabase;
  return { db, records };
}
function envelope(commandId: string, payload: unknown) {
  return { commandId, expectedOwnerUid: owner, payload };
}

Deno.test("custom category saves its selected icon", async () => {
  const { db, records } = memoryDatabase();
  const result = await saveCatalog(
    owner,
    envelope(
      "create-category",
      category({ name: "Travel", active: true, iconKey: "plane" }),
    ),
    db,
  );
  assert.deepEqual(records.get(`categories/${result.id}`), {
    name: "Travel",
    searchName: "travel",
    iconKey: "plane",
    active: true,
    revision: 1,
    isDefault: false,
  });
});

Deno.test("category icon editing preserves its default marker", async () => {
  const { db, records } = memoryDatabase();
  records.set("categories/custom", {
    ...records.get("categories/custom"),
    isDefault: true,
  });
  await saveCatalog(
    owner,
    envelope(
      "edit-category",
      category({ name: "Renamed", active: false, iconKey: "gift" }, true),
    ),
    db,
  );
  const updated = records.get("categories/custom")!;
  assert.equal(updated.iconKey, "gift");
  assert.equal(updated.name, "Renamed");
  assert.equal(updated.active, false);
  assert.equal(updated.revision, 4);
  assert.equal(updated.isDefault, true);
});

Deno.test("older category clients preserve the existing icon when omitted", async () => {
  const { db, records } = memoryDatabase();
  await saveCatalog(
    owner,
    envelope(
      "legacy-category-edit",
      category({ name: "Renamed", active: true }, true),
    ),
    db,
  );
  assert.equal(records.get("categories/custom")!.iconKey, "home");
  assert.equal(records.get("categories/custom")!.revision, 4);
});

for (
  const iconKey of ["https://example.com/icon.svg", "unknown", false, null]
) {
  Deno.test(`reject unsupported category icon ${iconKey}`, () => {
    assert.throws(() =>
      validateCatalog(category({ name: "Custom", active: true, iconKey }))
    );
  });
}
Deno.test("optional category icon never permits unknown fields", () => {
  assert.throws(() =>
    validateCatalog(
      category({
        name: "Custom",
        active: true,
        iconKey: "home",
        userId: "other",
      }),
    )
  );
});

Deno.test("payment sources persist stable provider identity and selected icon", async () => {
  const { db, records } = memoryDatabase();
  const result = await saveCatalog(
    owner,
    envelope("create-source", source({ providerId: "bdo", iconKey: "bank" })),
    db,
  );
  const updated = records.get(`paymentSources/${result.id}`)!;
  assert.equal(updated.providerId, "bdo");
  assert.equal(updated.iconKey, "bank");
  assert.equal(updated.name, "BDO savings");
  assert.equal(updated.type, "bankAccount");
});

Deno.test("renaming a payment source from an older client preserves provider metadata", async () => {
  const { db, records } = memoryDatabase();
  await saveCatalog(
    owner,
    envelope("legacy-source-edit", source({ name: "Emergency fund" }, true)),
    db,
  );
  const updated = records.get("paymentSources/source")!;
  assert.equal(updated.providerId, "bdo");
  assert.equal(updated.iconKey, "bank");
  assert.equal(updated.name, "Emergency fund");
});

Deno.test("a payment source can clear its provider and icon metadata", async () => {
  const { db, records } = memoryDatabase();
  await saveCatalog(
    owner,
    envelope(
      "clear-source-brand",
      source({ providerId: null, iconKey: null }, true),
    ),
    db,
  );
  const updated = records.get("paymentSources/source")!;
  assert.equal(updated.providerId, null);
  assert.equal(updated.iconKey, null);
});

for (const iconKey of ["wallet", "card", "cash", "other", "bank"]) {
  Deno.test(`source icon ${iconKey} is supported`, () => {
    assert.equal(validateCatalog(source({ iconKey })).values.iconKey, iconKey);
  });
}
Deno.test("payment source provider metadata rejects URLs and unsafe identifiers", () => {
  for (
    const providerId of [
      "https://example.com/bank",
      "<script>",
      "bank id",
      "a".repeat(81),
      false,
    ]
  ) {
    assert.throws(() => validateCatalog(source({ providerId })));
  }
  assert.throws(() => validateCatalog(source({ iconKey: "javascript" })));
  assert.throws(() =>
    validateCatalog(source({ providerId: "bdo", userId: "other" }))
  );
});
