import type { KeyValueStore } from "./types";
const opening = new Promise<IDBDatabase>((resolve, reject) => {
  if (typeof indexedDB === "undefined") {
    reject(new Error("Private storage is unavailable."));
    return;
  }
  const request = indexedDB.open("tally-expo-v1", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("private");
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
opening.catch(() => {});
async function transaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T> {
  const db = await opening;
  return new Promise((resolve, reject) => {
    const tx = db.transaction("private", mode);
    let value: T;
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new Error("Storage transaction aborted."));
    try {
      work(tx.objectStore("private"), (v) => {
        value = v;
      });
    } catch (e) {
      tx.abort();
      reject(e);
    }
  });
}
export const privateStore: KeyValueStore = {
  get: (key) =>
    transaction("readonly", (s, done) => {
      const r = s.get(key);
      r.onsuccess = () => done(r.result ?? null);
    }),
  set: async (key, value) => {
    await transaction("readwrite", (s, done) => {
      s.put(value, key);
      done(undefined);
    });
  },
  remove: async (key) => {
    await transaction("readwrite", (s, done) => {
      s.delete(key);
      done(undefined);
    });
  },
  keys: (prefix) =>
    transaction("readonly", (s, done) => {
      const r = s.getAllKeys();
      r.onsuccess = () =>
        done(
          r.result.filter(
            (k) => typeof k === "string" && k.startsWith(prefix),
          ) as string[],
        );
    }),
  atomic: (key, change) =>
    transaction("readwrite", (s, done) => {
      const r = s.get(key);
      r.onsuccess = () => {
        try {
          const next = change(r.result ?? null);
          if (next === null) s.delete(key);
          else s.put(next, key);
          done(next);
        } catch {
          r.transaction?.abort();
        }
      };
    }),
};
export const sessionStorageAdapter = {
  getItem: async (key: string) => localStorage.getItem(key),
  setItem: async (key: string, value: string) => {
    localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    localStorage.removeItem(key);
  },
};
