import type { SupabaseClient } from "@supabase/supabase-js";
import { runtimeConfig } from "../config";
import {
  decodeRow,
  decodeProfile,
  object,
  type Collection,
  type Data,
  type Profile,
  type Row,
} from "../domain/records";
import type { KeyValueStore } from "../storage/types";
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}
export interface Records {
  rows: Row[];
  cached: boolean;
}
export class TallyRepository {
  readonly prefix: string;
  private transientTransfers = new Map<string, string>();
  constructor(
    readonly client: SupabaseClient,
    readonly owner: string,
    private store: KeyValueStore,
    private trusted: () => Promise<boolean>,
    private active: () => boolean,
    readonly namespace: string,
  ) {
    this.prefix = `${namespace}:${owner}:`;
  }
  check() {
    if (!this.active())
      throw new ApiError("unauthenticated", "Your sign-in changed.");
  }
  async transferIntent(
    key: string,
    value?: string | null,
  ): Promise<string | null> {
    this.check();
    if (!key.startsWith(this.prefix + "upload:"))
      throw new Error("Invalid transfer owner.");
    if (await this.trusted()) {
      this.check();
      if (value === undefined) {
        const saved = await this.store.get(key);
        this.check();
        return saved;
      }
      if (value === null) await this.store.remove(key);
      else await this.store.set(key, value);
    } else {
      if (value === undefined) return this.transientTransfers.get(key) ?? null;
      if (value === null) this.transientTransfers.delete(key);
      else this.transientTransfers.set(key, value);
    }
    this.check();
    return value ?? null;
  }
  async invoke(name: string, input: Data): Promise<Data> {
    this.check();
    const config = runtimeConfig();
    const { data } = await this.client.auth.getSession();
    this.check();
    if (!data.session || data.session.user.id !== this.owner)
      throw new ApiError("unauthenticated", "Sign in again.");
    try {
      const response = await fetch(config.url + "/functions/v1/tally-api", {
        method: "POST",
        headers: {
          apikey: config.key,
          Authorization: "Bearer " + data.session.access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, input }),
        signal: AbortSignal.timeout(30000),
      });
      this.check();
      let body: Data;
      try {
        body = object(await response.json());
      } catch {
        throw new ApiError(
          "unverified",
          "Response could not be verified. Retry the same saved action.",
        );
      }
      if (!response.ok) {
        const error = object(body.error);
        const code = String(error.code);
        throw new ApiError(
          code,
          String(
            error.message ??
              {
                aborted: "This record changed. Refresh and review the action.",
                "invalid-argument":
                  "Check the amount, dates and required fields.",
                unauthenticated: "Sign in again.",
                "permission-denied": "Your account cannot access this record.",
                "failed-precondition": "Review this record before changing it.",
              }[code] ??
              "Tally could not complete this action.",
          ),
          ["unavailable", "deadline-exceeded", "resource-exhausted"].includes(
            code,
          ),
        );
      }
      try {
        return object(body.result);
      } catch {
        throw new ApiError(
          "unverified",
          "Response could not be verified. Retry the same saved action.",
        );
      }
    } catch (e) {
      this.check();
      if (e instanceof ApiError) throw e;
      throw new ApiError(
        "unavailable",
        "Connection unavailable. Saved actions will retry.",
        true,
      );
    }
  }
  command(name: string, payload: Data, id: string) {
    return this.invoke(name, {
      commandId: id,
      expectedOwnerUid: this.owner,
      payload,
    });
  }
  private async remember(key: string, value: unknown) {
    this.check();
    if (await this.trusted()) {
      this.check();
      try {
        const encoded = JSON.stringify({
          owner: this.owner,
          namespace: this.namespace,
          schema: 1,
          value,
        });
        if (encoded.length <= 2 * 1024 * 1024) {
          this.check();
          await this.store.set(this.prefix + "cache:" + key, encoded);
          this.check();
        }
      } catch {
        /* Cache cannot undo a confirmed server result. */
      }
    }
  }
  private async cached(key: string) {
    this.check();
    if (!(await this.trusted())) return null;
    const raw = await this.store.get(this.prefix + "cache:" + key);
    if (!raw || raw.length > 2 * 1024 * 1024) return null;
    const value = JSON.parse(raw);
    if (
      value.owner !== this.owner ||
      value.namespace !== this.namespace ||
      value.schema !== 1
    )
      throw new ApiError("unverified", "Private cache needs recovery.");
    this.check();
    return value.value as unknown;
  }
  async profile(): Promise<{ profile: Profile; cached: boolean }> {
    try {
      const result = await this.invoke("bootstrapUser", {});
      const profile = decodeProfile(result.profile, this.owner);
      await this.remember("profile", profile);
      this.check();
      return { profile, cached: false };
    } catch (e) {
      if (e instanceof ApiError && e.retryable) {
        const saved = await this.cached("profile");
        if (saved)
          return { profile: decodeProfile(saved, this.owner), cached: true };
      }
      throw e;
    }
  }
  async updateProfile(
    profile: Profile,
    changes: Pick<
      Profile,
      "defaultCurrency" | "timezone" | "themeMode" | "onboardingComplete"
    >,
    id: string,
  ) {
    const result = await this.invoke("updateProfile", {
      commandId: id,
      expectedOwnerUid: this.owner,
      expectedRevision: profile.revision,
      ...changes,
    });
    const next = decodeProfile(result.profile, this.owner);
    await this.remember("profile", next);
    this.check();
    return next;
  }
  async records(collection: Collection): Promise<Records> {
    this.check();
    try {
      const rows: Row[] = [];
      let after: Data | null = null;
      for (let page = 0; page < 50; page++) {
        const {
          data,
          error,
        }: { data: unknown; error: { code?: string } | null } =
          await this.client.rpc("tally_read_page", {
            collection_name: collection,
            request: { limit: 200, equals: {}, ranges: [], order: [], after },
          });
        this.check();
        if (error) {
          if (
            error.code === "42501" ||
            error.code === "PGRST301" ||
            error.code === "PGRST116"
          )
            throw new ApiError(
              "unauthenticated",
              "Private records require a current sign-in.",
            );
          throw new ApiError(
            error.code ?? "unavailable",
            "Private records could not load.",
            error.code == null ||
              error.code === "" ||
              ["503", "502", "504"].includes(error.code),
          );
        }
        if (!Array.isArray(data))
          throw new ApiError(
            "unverified",
            "Private records could not be verified.",
          );
        const decoded: Row[] = data.map((row) => decodeRow(row, this.owner));
        rows.push(...decoded.slice(0, 200));
        if (decoded.length <= 200) {
          await this.remember(collection, rows);
          this.check();
          return { rows, cached: false };
        }
        after = { id: decoded[199].id, values: {} };
      }
      throw new ApiError(
        "too-many-records",
        "More than 10,000 records require a narrower query.",
      );
    } catch (e) {
      this.check();
      if ((e instanceof ApiError && e.retryable) || e instanceof TypeError) {
        const cached = await this.cached(collection);
        if (Array.isArray(cached))
          return {
            rows: cached.map((row) => decodeRow(row, this.owner)),
            cached: true,
          };
      }
      throw e;
    }
  }
  async clearPrivateData() {
    for (const key of await this.store.keys(this.prefix))
      await this.store.remove(key);
  }
}
