import type { Data } from "../../../core/domain/records";
import type { CommandStore, SavedCommand } from "./store";
import { validateReceipt, type Digest } from "./receipt";
export class CommandQueue {
  private flushing: Promise<void> | null = null;
  constructor(
    private store: CommandStore,
    private owner: string,
    private environment: string,
    private active: () => boolean,
    private send: (command: SavedCommand) => Promise<Data>,
    private uuid: () => string = () => crypto.randomUUID(),
    private digest?: Digest,
  ) {}
  private check() {
    if (!this.active()) throw new Error("Your sign-in changed.");
  }
  async list() {
    this.check();
    return (await this.store.all())
      .filter(
        (c) =>
          c.owner === this.owner &&
          c.environment === this.environment &&
          c.schema === 1,
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async enqueue(name: string, payload: Data) {
    this.check();
    if (
      (await this.list()).filter(
        (c) => !["synced", "discarded"].includes(c.status),
      ).length >= 1000
    )
      throw new Error("Sync or review saved actions before adding more.");
    const item: SavedCommand = {
      id: this.uuid(),
      owner: this.owner,
      environment: this.environment,
      schema: 1,
      name,
      payload: JSON.parse(JSON.stringify(payload)),
      status: "pending",
      createdAt: new Date().toISOString(),
      leaseUntil: 0,
      error: null,
      result: null,
    };
    await this.store.atomic(item.id, () => {
      this.check();
      return item;
    });
    this.check();
    return item;
  }
  async retry(id: string) {
    this.check();
    await this.store.atomic(id, (c) => {
      if (
        !c ||
        c.owner !== this.owner ||
        c.environment !== this.environment ||
        ["synced", "discarded"].includes(c.status) ||
        c.status === "running"
      )
        return c;
      return { ...c, status: "pending", error: null };
    });
    await this.flush();
  }
  async discard(id: string) {
    this.check();
    await this.store.atomic(id, (c) => {
      if (
        !c ||
        c.owner !== this.owner ||
        c.environment !== this.environment ||
        c.status !== "review" ||
        ![
          "aborted",
          "invalid-argument",
          "failed-precondition",
          "already-exists",
        ].includes(c.rejectionCode ?? "")
      )
        throw new Error(
          "Uncertain actions must be verified by retrying the same action.",
        );
      return { ...c, status: "discarded" };
    });
  }
  flush() {
    if (this.flushing) return this.flushing;
    this.flushing = this.drain().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }
  private async drain() {
    for (const item of await this.list()) {
      if (!this.active()) return;
      let acquired = false;
      const leased = await this.store.atomic(item.id, (current) => {
        if (
          !current ||
          current.owner !== this.owner ||
          current.environment !== this.environment ||
          !["pending", "running"].includes(current.status) ||
          current.leaseUntil > Date.now()
        )
          return current;
        acquired = true;
        return {
          ...current,
          status: "running",
          leaseUntil: Date.now() + 60000,
        };
      });
      if (!acquired || !leased) continue;
      try {
        const result = await this.send(leased);
        this.check();
        try {
          await validateReceipt(leased, result, this.digest);
        } catch {
          throw Object.assign(
            new Error(
              "Response could not be verified. Retry uses the same action ID.",
            ),
            { review: true },
          );
        }
        await this.store.atomic(item.id, (c) =>
          c
            ? { ...c, status: "synced", leaseUntil: 0, error: null, result }
            : null,
        );
      } catch (error) {
        if (!this.active()) return;
        const e = error as Error & {
          retryable?: boolean;
          review?: boolean;
          code?: string;
        };
        await this.store.atomic(item.id, (c) =>
          c
            ? {
                ...c,
                status: e.retryable ? "pending" : "review",
                leaseUntil: 0,
                error: e.message || "Action needs review.",
                rejectionCode: e.code,
              }
            : null,
        );
        if (e.retryable) return;
      }
    }
  }
}
