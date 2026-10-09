import { createHash } from "node:crypto";
import { exactObject } from "./callable.ts";
import { HttpsError } from "./errors.ts";
import { identifier } from "./validation.ts";
import { Audit, type RecordData } from "./runtime.ts";
import { CommandDatabase, type Mutation } from "./database.ts";
import { stageProjectionMutation } from "../jobs/projection_jobs.ts";
import { stageReminderReconciliation } from "../notifications/reconciliation_job.ts";

export function commandDocumentId(commandId: string, role: string): string {
  if (!/^[a-z][a-zA-Z0-9-]{0,31}$/.test(role)) {
    throw new Error("Invalid command role");
  }
  return `${role}-${
    createHash("sha256").update(JSON.stringify([commandId, role])).digest("hex")
  }`;
}
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map((
        [key, item],
      ) => [key, ordered(item)]),
    );
  }
  return value;
}

export class OwnerCommandContext {
  readonly mutations: Mutation[] = [];
  private readonly reads = new Map<string, Promise<RecordData | null>>();
  private readonly guards: (() => void)[] = [];
  constructor(
    readonly db: CommandDatabase,
    readonly uid: string,
    readonly commandId: string,
    readonly profile: RecordData,
  ) {}
  id(role: string): string {
    return commandDocumentId(`${this.uid}:${this.commandId}`, role);
  }
  async maybeRead(collection: string, id: string): Promise<RecordData | null> {
    identifier(id);
    const key = `${collection}:${id}`;
    if (!this.reads.has(key)) {
      this.reads.set(key, this.db.read(this.uid, collection, id));
    }
    const data = await this.reads.get(key)!;
    if (data && (data.userId !== this.uid || data.schemaVersion !== 1)) {
      throw new HttpsError(
        "failed-precondition",
        "A linked record is unavailable.",
      );
    }
    return data;
  }
  async read(collection: string, id: string): Promise<RecordData> {
    const value = await this.maybeRead(collection, id);
    if (!value) {
      throw new HttpsError(
        "failed-precondition",
        "A linked record is unavailable.",
      );
    }
    return value;
  }
  create(collection: string, id: string, data: RecordData): void {
    this.mutations.push({
      kind: "create",
      collection,
      id: identifier(id),
      data,
    });
  }
  update(collection: string, id: string, data: RecordData): void {
    this.mutations.push({
      kind: "update",
      collection,
      id: identifier(id),
      data,
    });
  }
  readSystemJob(id: string): Promise<RecordData | null> {
    return this.maybeRead("systemJobs", id);
  }
  systemJob(id: string, data: RecordData, exists: boolean): void {
    if (exists) this.update("systemJobs", id, data);
    else this.create("systemJobs", id, data);
  }
  countWhere(
    collection: string,
    filters: readonly { field: string; op: string; value: unknown }[],
  ): Promise<number> {
    return this.db.count(this.uid, collection, filters);
  }
  activity(type: string, data: RecordData): void {
    const role = `activity-${type}`;
    const id = role.length <= 32 ? this.id(role) : commandDocumentId(
      JSON.stringify([this.uid, this.commandId, type]),
      "activity",
    );
    this.create("activities", id, {
      type,
      recordedAt: Audit.serverTimestamp(),
      ...data,
    });
  }
  beforeCommit(guard: () => void): void {
    this.guards.push(guard);
  }
  checkGuards(): void {
    for (const guard of this.guards) guard();
  }
}

export function executeOwnerCommand<P, R>(
  uid: string,
  input: unknown,
  type: string,
  validate: (value: unknown) => P,
  handler: (context: OwnerCommandContext, payload: P) => Promise<R>,
  db: CommandDatabase,
): Promise<R> {
  return run(uid, input, type, validate, handler, db, true);
}
export function executeMetadataCommand<P, R>(
  uid: string,
  input: unknown,
  type: string,
  validate: (value: unknown) => P,
  handler: (context: OwnerCommandContext, payload: P) => Promise<R>,
  db: CommandDatabase,
): Promise<R> {
  return run(uid, input, type, validate, handler, db, false);
}
async function run<P, R>(
  uid: string,
  input: unknown,
  type: string,
  validate: (value: unknown) => P,
  handler: (context: OwnerCommandContext, payload: P) => Promise<R>,
  db: CommandDatabase,
  financial: boolean,
): Promise<R> {
  identifier(uid);
  const envelope = exactObject(input, [
    "commandId",
    "expectedOwnerUid",
    "payload",
  ]);
  const id = identifier(envelope.commandId);
  if (identifier(envelope.expectedOwnerUid) !== uid) {
    throw new HttpsError("permission-denied", "Your sign-in changed.");
  }
  const payload = validate(envelope.payload);
  const hash = createHash("sha256").update(
    JSON.stringify(ordered({ type, payload })),
  ).digest("hex");
  for (let attempt = 0; attempt < 5; attempt++) {
    const profile = await db.profile(uid);
    const receipt = await db.receipt(uid, id);
    if (receipt) {
      if (receipt.commandType !== type || receipt.payloadHash !== hash) {
        throw new HttpsError(
          "already-exists",
          "This action identifier was already used.",
        );
      }
      return receipt.result as R;
    }
    const context = new OwnerCommandContext(db, uid, id, profile.data);
    try {
      const ledger = financial
        ? await context.read("ledgerState", "current")
        : null;
      const result = await handler(context, payload);
      if (ledger) {
        const next = ledger.revision + 1;
        if (!Number.isSafeInteger(next)) {
          throw new HttpsError("failed-precondition", "Ledger needs recovery.");
        }
        await stageProjectionMutation(context, next, new Date());
        await stageReminderReconciliation(context);
        context.update("ledgerState", "current", {
          revision: next,
          lastMutationAt: Audit.serverTimestamp(),
        });
      }
      context.checkGuards();
      return await db.commit(
        uid,
        id,
        type,
        hash,
        profile.version,
        context.mutations,
        result,
      ) as R;
    } catch (error) {
      if (
        !(error instanceof HttpsError) || error.code !== "aborted" ||
        attempt === 4
      ) throw error;
    }
  }
  throw new HttpsError("aborted", "Refresh and try again.");
}
