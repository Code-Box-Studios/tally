import type { SupabaseClient } from "@supabase/supabase-js";
import { databaseError, HttpsError } from "./errors.ts";
import { persisted, type RecordData } from "./runtime.ts";

export const tables: Record<string, string> = {
  profiles: "tally_profiles",
  contacts: "tally_contacts",
  paymentSources: "tally_payment_sources",
  categories: "tally_categories",
  obligations: "tally_obligations",
  obligationInstances: "tally_obligation_instances",
  payments: "tally_payments",
  paymentReversals: "tally_payment_reversals",
  activities: "tally_activities",
  summaries: "tally_summaries",
  ledgerState: "tally_ledger_state",
  deductionAttempts: "tally_deduction_attempts",
  deductionEvents: "tally_deduction_events",
  paymentEvidence: "tally_payment_evidence",
  reminders: "tally_reminders",
  notificationPreferences: "tally_notification_preferences",
  attachments: "tally_attachments",
  notificationDevices: "tally_notification_devices",
  systemJobs: "tally_jobs",
};

export interface Mutation {
  kind: "create" | "update";
  collection: string;
  id: string;
  data: RecordData;
}

/** Explicit SQL repository boundary used by trusted, feature-specific services. */
export class CommandDatabase {
  constructor(readonly client: SupabaseClient) {}
  async profile(owner: string): Promise<{ data: RecordData; version: number }> {
    const { data, error } = await this.client.from(tables.profiles!).select(
      "data,version",
    ).eq("user_id", owner).single();
    if (error) throw databaseError(error);
    if (data.data.userId !== owner || data.data.accountStatus !== "active") {
      throw new HttpsError(
        "failed-precondition",
        "Your account is unavailable.",
      );
    }
    return { data: persisted(data.data) as RecordData, version: data.version };
  }
  async read(
    owner: string,
    collection: string,
    id: string,
  ): Promise<RecordData | null> {
    if (!tables[collection]) {
      throw new HttpsError("internal", "Unsupported collection.");
    }
    const { data, error } = await this.client.from(tables[collection]!).select(
      "data",
    ).eq("user_id", owner).eq("id", id).maybeSingle();
    if (error) throw databaseError(error);
    return data ? persisted(data.data) as RecordData : null;
  }
  async readJob(id: string): Promise<RecordData | null> {
    const { data, error } = await this.client.from(tables.systemJobs!).select(
      "data",
    ).eq("id", id).limit(2);
    if (error) throw databaseError(error);
    if (data.length > 1) {
      throw new HttpsError("failed-precondition", "Ambiguous job.");
    }
    return data[0] ? persisted(data[0].data) as RecordData : null;
  }
  async count(
    owner: string,
    collection: string,
    filters: readonly { field: string; op: string; value: unknown }[],
  ): Promise<number> {
    let query = this.client.from(tables[collection]!).select("id", {
      count: "exact",
      head: true,
    }).eq("user_id", owner);
    for (const filter of filters) {
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(filter.field)) {
        throw new HttpsError("internal", "Invalid query.");
      }
      const field = `data->>${filter.field}`;
      if (filter.op === "==") query = query.eq(field, filter.value);
      else if (filter.op === ">") query = query.gt(field, filter.value);
      else if (filter.op === ">=") query = query.gte(field, filter.value);
      else throw new HttpsError("internal", "Unsupported comparison.");
    }
    const { count, error } = await query;
    if (error) throw databaseError(error);
    return count ?? 0;
  }
  /** Bounded keyset scan; never publish totals from a truncated ledger. */
  async scan(
    owner: string,
    collection: string,
    maximum = 10000,
  ): Promise<RecordData[]> {
    if (!tables[collection] || collection === "profiles") {
      throw new HttpsError("internal", "Unsupported collection.");
    }
    const records: RecordData[] = [];
    let cursor: string | null = null;
    for (;;) {
      let query = this.client.from(tables[collection]!).select("id,data").eq(
        "user_id",
        owner,
      ).order("id").limit(250);
      if (cursor) query = query.gt("id", cursor);
      const { data, error } = await query;
      if (error) throw databaseError(error);
      for (const row of data) {
        if (row.data.userId !== owner || row.data.schemaVersion !== 1) {
          throw new HttpsError(
            "failed-precondition",
            "History needs recovery.",
          );
        }
        records.push({
          ...persisted(row.data) as RecordData,
          ...(collection === "contacts" ? { contactId: row.id } : {}),
        });
      }
      if (records.length > maximum) {
        throw new HttpsError(
          "resource-exhausted",
          "History exceeds the current processing limit.",
        );
      }
      if (data.length < 250) return records;
      cursor = data[data.length - 1]!.id;
    }
  }
  async receipt(owner: string, id: string): Promise<RecordData | null> {
    const { data, error } = await this.client.rpc("tally_command_receipt", {
      owner_id: owner,
      command_id: id,
    });
    if (error) throw databaseError(error);
    return data;
  }
  async commit(
    owner: string,
    id: string,
    type: string,
    hash: string,
    version: number,
    mutations: Mutation[],
    result: unknown,
  ): Promise<unknown> {
    const { data, error } = await this.client.rpc("tally_commit_command", {
      owner_id: owner,
      command_id: id,
      command_type: type,
      payload_hash: hash,
      owner_version: version,
      mutations: JSON.parse(JSON.stringify(mutations)),
      command_result: result,
    });
    if (error) throw databaseError(error);
    return data;
  }
}
