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
  work: (
    store: IDBObjectStore,
    done: (value: T) => void,
    fail: (error: unknown) => void,
  ) => void,
  trustKey?: string,
): Promise<T> {
  const db = await opening;
  return new Promise((resolve, reject) => {
    const tx = db.transaction("private", mode);
    let value: T;
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new Error("Storage transaction aborted."));
    const fail = (error: unknown) => {
      tx.abort();
      reject(error);
    };
    const store = tx.objectStore("private");
    const start = () => {
      try {
        work(
          store,
          (v) => {
            value = v;
          },
          fail,
        );
      } catch (e) {
        fail(e);
      }
    };
    if (trustKey) {
      const permission = store.get(trustKey);
      permission.onsuccess = () => {
        if (permission.result === "true") start();
        else
          fail(
            new Error(
              "Device trust changed. Reopen Settings to review offline saving.",
            ),
          );
      };
    } else start();
  });
}
function createStore(trustKey?: string): KeyValueStore {
  return {
    guard: (key) => createStore(key),
    revokeTrust,
    get: (key) =>
      transaction(
        "readonly",
        (s, done) => {
          const r = s.get(key);
          r.onsuccess = () => done(r.result ?? null);
        },
        trustKey,
      ),
    set: async (key, value) => {
      await transaction(
        "readwrite",
        (s, done) => {
          s.put(value, key);
          done(undefined);
        },
        trustKey,
      );
    },
    remove: async (key) => {
      await transaction(
        "readwrite",
        (s, done) => {
          s.delete(key);
          done(undefined);
        },
        trustKey,
      );
    },
    keys: (prefix) =>
      transaction(
        "readonly",
        (s, done) => {
          const r = s.getAllKeys();
          r.onsuccess = () =>
            done(
              r.result.filter(
                (k) => typeof k === "string" && k.startsWith(prefix),
              ) as string[],
            );
        },
        trustKey,
      ),
    atomic: (key, change) =>
      transaction(
        "readwrite",
        (s, done, fail) => {
          const r = s.get(key);
          r.onsuccess = () => {
            try {
              const next = change(r.result ?? null);
              if (next === null) s.delete(key);
              else s.put(next, key);
              done(next);
            } catch (e) {
              fail(e);
            }
          };
        },
        trustKey,
      ),
  };
}
export const privateStore = createStore();
async function revokeTrust(prefix: string): Promise<void> {
  await transaction("readwrite", (store, done, fail) => {
    const request = store.getAllKeys();
    request.onsuccess = () => {
      const owned = request.result.filter(
        (k): k is string => typeof k === "string" && k.startsWith(prefix),
      );
      const commands = owned.filter((k) => k.startsWith(prefix + "command:"));
      let waiting = commands.length;
      const finish = () => {
        store.put("false", prefix + "trust");
        for (const key of owned)
          if (key !== prefix + "trust") store.delete(key);
        done(undefined);
      };
      if (!waiting) {
        finish();
        return;
      }
      for (const key of commands) {
        const command = store.get(key);
        command.onsuccess = () => {
          try {
            if (
              command.result &&
              !["synced", "discarded"].includes(
                JSON.parse(command.result).status,
              )
            ) {
              fail(
                new Error(
                  "Sync or review saved actions before removing device trust.",
                ),
              );
              return;
            }
            if (--waiting === 0) finish();
          } catch (e) {
            fail(e);
          }
        };
      }
    };
  });
}
export const sessionStorageAdapter = {
  getItem: async (key: string) => localStorage.getItem(key),
  setItem: async (key: string, value: string) => {
    localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    localStorage.removeItem(key);
  },
};
