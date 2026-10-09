import type { Data } from "../../../core/domain/records";
export interface SavedCommand {
  id: string;
  owner: string;
  environment: string;
  schema: 1;
  name: string;
  payload: Data;
  status: "pending" | "running" | "review" | "synced" | "discarded";
  createdAt: string;
  leaseUntil: number;
  error: string | null;
  rejectionCode?: string;
  result: Data | null;
}
export interface CommandStore {
  all(): Promise<SavedCommand[]>;
  atomic(
    id: string,
    change: (existing: SavedCommand | null) => SavedCommand | null,
  ): Promise<SavedCommand | null>;
  close(): Promise<void>;
}
