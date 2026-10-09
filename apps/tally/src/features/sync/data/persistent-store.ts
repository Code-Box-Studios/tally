import type { KeyValueStore } from "../../../core/storage/types";
import type { CommandStore, SavedCommand } from "./store";
export class PersistentCommandStore implements CommandStore {
  constructor(
    private store: KeyValueStore,
    private prefix: string,
  ) {}
  async all() {
    const keys = await this.store.keys(this.prefix);
    if (keys.length > 1000)
      throw new Error("Saved actions need cleanup before adding more.");
    const rows = await Promise.all(
      keys.map(async (key) => {
        const value = await this.store.get(key);
        if (!value) return null;
        const row = JSON.parse(value) as SavedCommand;
        if (
          row.schema !== 1 ||
          typeof row.id !== "string" ||
          key !== this.prefix + row.id ||
          !row.payload ||
          typeof row.payload !== "object"
        )
          throw new Error("Saved actions need recovery.");
        return row;
      }),
    );
    return rows.filter((row): row is SavedCommand => row !== null);
  }
  async atomic(
    id: string,
    change: (existing: SavedCommand | null) => SavedCommand | null,
  ) {
    const result = await this.store.atomic(this.prefix + id, (value) => {
      const next = change(value ? JSON.parse(value) : null);
      return next ? JSON.stringify(next) : null;
    });
    return result ? (JSON.parse(result) as SavedCommand) : null;
  }
  async close() {}
}
