export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
  atomic(
    key: string,
    change: (value: string | null) => string | null,
  ): Promise<string | null>;
}
