export interface KeyValueStore {
  /** Web storage checks shared trust inside each IndexedDB transaction. */
  guard?(trustKey: string): KeyValueStore;
  /** Rejects unresolved actions and removes owner data atomically. */
  revokeTrust?(ownerPrefix: string): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
  atomic(
    key: string,
    change: (value: string | null) => string | null,
  ): Promise<string | null>;
}
