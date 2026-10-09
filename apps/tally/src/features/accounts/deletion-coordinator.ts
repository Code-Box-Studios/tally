import type { Data } from "../../core/domain/records";
interface Store {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
}
/** An accepted deletion survives restarts until owner-local cleanup completes. */
export class DeletionCoordinator {
  constructor(
    private store: Store,
    private key: string,
    private owner: string,
    private active: () => boolean,
    private send: (id: string) => Promise<Data>,
    private cleanup: () => Promise<void>,
    private uuid: () => string = () => crypto.randomUUID(),
  ) {}
  async request() {
    if (!this.active()) throw new Error("Your sign-in changed.");
    const raw = await this.store.get(this.key),
      intent = raw
        ? JSON.parse(raw)
        : { owner: this.owner, id: this.uuid(), state: "pending" };
    if (
      intent.owner !== this.owner ||
      typeof intent.id !== "string" ||
      !["pending", "accepted"].includes(intent.state)
    )
      throw new Error("Deletion needs recovery.");
    await this.store.set(this.key, JSON.stringify(intent));
    if (intent.state === "pending") {
      let result: Data;
      try {
        result = await this.send(intent.id);
      } catch (e) {
        if (
          this.active() &&
          [
            "failed-precondition",
            "invalid-argument",
            "permission-denied",
          ].includes(String((e as { code?: string }).code))
        )
          await this.store.remove(this.key);
        throw e;
      }
      if (
        !this.active() ||
        result.userId !== this.owner ||
        !["pending", "leased", "needsRecovery", "complete"].includes(
          String(result.status),
        )
      )
        throw new Error(
          "Deletion could not be verified. Retry the same request.",
        );
      intent.state = "accepted";
      await this.store.set(this.key, JSON.stringify(intent));
    }
    if (!this.active()) throw new Error("Your sign-in changed.");
    await this.cleanup();
    await this.store.remove(this.key);
  }
}
