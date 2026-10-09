import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import type { KeyValueStore } from "./types";
const opening = (async () => {
  const db = await SQLite.openDatabaseAsync("tally-expo-v1.db");
  await db.execAsync(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS private_values (key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL);",
  );
  return db;
})();
export const privateStore: KeyValueStore = {
  get: async (key) => {
    const row = await (
      await opening
    ).getFirstAsync<{ value: string }>(
      "SELECT value FROM private_values WHERE key=?",
      key,
    );
    return row?.value ?? null;
  },
  set: async (key, value) => {
    await (
      await opening
    ).runAsync(
      "INSERT INTO private_values(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      key,
      value,
    );
  },
  remove: async (key) => {
    await (
      await opening
    ).runAsync("DELETE FROM private_values WHERE key=?", key);
  },
  keys: async (prefix) =>
    (
      await (
        await opening
      ).getAllAsync<{ key: string }>(
        "SELECT key FROM private_values WHERE substr(key,1,?)=?",
        prefix.length,
        prefix,
      )
    ).map((r) => r.key),
  atomic: async (key, change) => {
    const db = await opening;
    let result: string | null = null;
    await db.withExclusiveTransactionAsync(async (tx) => {
      const current = await tx.getFirstAsync<{ value: string }>(
        "SELECT value FROM private_values WHERE key=?",
        key,
      );
      result = change(current?.value ?? null);
      if (result === null)
        await tx.runAsync("DELETE FROM private_values WHERE key=?", key);
      else
        await tx.runAsync(
          "INSERT INTO private_values(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          key,
          result,
        );
    });
    return result;
  },
};
export const sessionStorageAdapter = {
  getItem: async (key: string) => {
    const count = Number(await SecureStore.getItemAsync(key + ".count"));
    if (!Number.isInteger(count) || count < 1 || count > 32) return null;
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        SecureStore.getItemAsync(key + "." + i),
      ),
    );
    return chunks.some((c) => c === null) ? null : chunks.join("");
  },
  setItem: async (key: string, value: string) => {
    if (value.length > 57600)
      throw new Error("Session exceeds secure storage limit.");
    const count = Math.ceil(value.length / 1800);
    for (let i = 0; i < count; i++)
      await SecureStore.setItemAsync(
        key + "." + i,
        value.slice(i * 1800, (i + 1) * 1800),
      );
    await SecureStore.setItemAsync(key + ".count", String(count));
  },
  removeItem: async (key: string) => {
    const count = Number(await SecureStore.getItemAsync(key + ".count"));
    await SecureStore.deleteItemAsync(key + ".count");
    if (Number.isInteger(count) && count > 0 && count <= 32)
      for (let i = 0; i < count; i++)
        await SecureStore.deleteItemAsync(key + "." + i);
  },
};
