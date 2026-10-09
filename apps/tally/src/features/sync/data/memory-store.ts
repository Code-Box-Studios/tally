import type { CommandStore, SavedCommand } from "./store";
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export class MemoryStore implements CommandStore {
  private rows = new Map<string, SavedCommand>();
  async all() {
    return clone([...this.rows.values()]);
  }
  async atomic(
    id: string,
    change: (existing: SavedCommand | null) => SavedCommand | null,
  ) {
    const next = change(clone(this.rows.get(id) ?? null));
    if (next) this.rows.set(id, clone(next));
    else this.rows.delete(id);
    return clone(next);
  }
  async close() {}
}
