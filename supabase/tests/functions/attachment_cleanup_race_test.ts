// Read-only memory reproduction. No network or production database calls.
import { uploadAttachment } from "../../functions/tally-api/attachments/service.ts";
import { cleanupFile } from "../../functions/tally-api/attachments/cleanup.ts";
import { Instant } from "../../functions/tally-api/shared/runtime.ts";
import { HttpsError } from "../../functions/tally-api/shared/errors.ts";
Deno.test("Expired finalizer cannot publish ready bytes after cleanup disposal starts", async () => {
  const owner = "11111111-1111-4111-8111-111111111111";
  const originalNow = Date.now, base = originalNow();
  let clock = base;
  Date.now = () => clock;
  const content = new TextEncoder().encode("%PDF-1.7\nmemory fixture\n%%EOF\n");
  const encoded = btoa(String.fromCharCode(...content));
  const id = "file", uploadId = "upload";
  const path = "users/" + owner + "/attachments/file/content";
  const jobId = "cleanupjob", cleanupToken = "cleanuplease";
  let version = 1, objectExists = false, finalizedPhase = false;
  let triggered = false, waitingCleanup = false;
  let file: any = {
    userId: owner,
    schemaVersion: 1,
    attachmentId: id,
    targetType: "obligation",
    targetId: "parent",
    obligationId: "parent",
    currency: "PHP",
    storagePath: path,
    filename: "receipt.pdf",
    declaredContentType: "application/pdf",
    declaredSizeBytes: content.length,
    declaredSha256: null,
    state: "awaitingUpload",
    revision: 1,
    expiresAt: Instant.fromMillis(base + 1000),
  };
  let job: any = {
    userId: owner,
    schemaVersion: 1,
    kind: "fileCleanup",
    subjectId: id,
    status: "pending",
    generation: 1,
    nextRunAt: Instant.fromMillis(base + 1000),
    leaseToken: null,
    leaseGeneration: null,
    leaseExpiresAt: null,
  };
  let releaseCleanup!: () => void, signalPaused!: () => void;
  const pause = new Promise<void>((r) => releaseCleanup = r);
  const paused = new Promise<void>((r) => signalPaused = r);
  let cleanupPromise: Promise<unknown> | undefined;
  const receipts = new Map<string, any>();
  const db: any = {
    client: {
      storage: {
        from: () => ({
          upload: async () => {
            objectExists = true;
            return { error: null };
          },
          download: async () => {
            // Cleanup lease was claimed after reservation expiry, before finalizer
            // captures its owner epoch. The upload lease remains valid at 59s.
            clock = base + 59000;
            job = {
              ...job,
              status: "leased",
              leaseToken: cleanupToken,
              leaseGeneration: 1,
              leaseExpiresAt: Instant.fromMillis(base + 121000),
            };
            version++;
            finalizedPhase = true;
            return { error: null, data: new Blob([content]) };
          },
          remove: async () => {
            objectExists = false;
            return { error: null };
          },
        }),
      },
    },
    profile: async () => {
      if (waitingCleanup) {
        waitingCleanup = false;
        signalPaused();
        await pause;
      }
      return {
        data: { userId: owner, schemaVersion: 1, accountStatus: "active" },
        version,
      };
    },
    readJob: async () => ({ ...job }),
    receipt: async (_uid: string, cmd: string) => receipts.get(cmd) ?? null,
    read: async (_uid: string, collection: string, _id: string) => {
      if (collection === "attachments") return { ...file };
      if (collection === "systemJobs") return { ...job };
      if (collection === "obligations") {
        if (finalizedPhase && !triggered) {
          triggered = true;
          // Finalizer passed its lease check, then waited on a target read.
          // Cleanup now sees expired processing metadata and starts disposal.
          clock = base + 81000;
          waitingCleanup = true;
          cleanupPromise = cleanupFile(jobId, cleanupToken, db).catch(
            (e) => ({ error: e.code }),
          );
          await paused;
        }
        return {
          userId: owner,
          schemaVersion: 1,
          obligationId: "parent",
          currency: "PHP",
        };
      }
      return null;
    },
    commit: async (
      _uid: string,
      cmd: string,
      type: string,
      hash: string,
      readVersion: number,
      mutations: any[],
      result: any,
    ) => {
      // Mimic SQL epoch CAS. Cleanup has not committed a fence when finalizer wins.
      if (readVersion !== version) {
        throw new HttpsError("aborted", "Owner changed.");
      }
      for (const mutation of mutations) {
        if (mutation.collection === "attachments") {
          file = { ...file, ...mutation.data };
        }
        if (mutation.collection === "systemJobs") {
          job = { ...job, ...mutation.data };
        }
      }
      version++;
      receipts.set(cmd, { commandType: type, payloadHash: hash, result });
      return result;
    },
  };
  try {
    const result = await uploadAttachment(owner, {
      commandId: uploadId,
      expectedOwnerUid: owner,
      payload: {
        attachmentId: id,
        expectedRevision: 1,
        contentBase64: encoded,
      },
    }, db).catch((error) => ({ error: error.code }));
    releaseCleanup();
    const cleanupResult = await cleanupPromise;
    if ("storageGeneration" in result && !objectExists) {
      throw new Error("A successful ready file lost its Storage bytes");
    }
    if ("storageGeneration" in result) {
      throw new Error("Finalization must reject an expired upload lease");
    }
    if (file.state !== "rejected" || objectExists) {
      throw new Error("Expired file disposal did not finish safely");
    }
  } finally {
    Date.now = originalNow;
  }
});

Deno.test("Storage disposal starts only after an irreversible metadata fence commits", async () => {
  const owner = "11111111-1111-4111-8111-111111111111",
    id = "cleanup-fence",
    token = "lease";
  let version = 1, removed = false;
  let file: any = {
    userId: owner,
    schemaVersion: 1,
    attachmentId: "file",
    state: "processing",
    revision: 2,
    storagePath: `users/${owner}/attachments/file/content`,
    expiresAt: Instant.fromMillis(Date.now() - 90000),
    uploadLeaseExpiresAt: Instant.fromMillis(Date.now() - 30000),
  };
  let job: any = {
    userId: owner,
    schemaVersion: 1,
    kind: "fileCleanup",
    subjectId: "file",
    status: "leased",
    generation: 1,
    leaseGeneration: 1,
    leaseToken: token,
    leaseExpiresAt: Instant.fromMillis(Date.now() + 120000),
  };
  const db: any = {
    profile: async () => ({
      data: { userId: owner, schemaVersion: 1, accountStatus: "active" },
      version,
    }),
    receipt: async () => null,
    readJob: async () => ({ ...job }),
    read: async (_u: string, collection: string) => ({
      ...collection === "attachments" ? file : job,
    }),
    commit: async (
      _u: string,
      _id: string,
      _type: string,
      _hash: string,
      readVersion: number,
      mutations: any[],
      result: unknown,
    ) => {
      if (readVersion !== version) {
        throw new HttpsError(
          "aborted",
          "Concurrent update",
        );
      }
      for (const mutation of mutations) {
        if (mutation.collection === "attachments") {
          file = {
            ...file,
            ...mutation.data,
          };
        } else if (mutation.collection === "systemJobs") {
          job = {
            ...job,
            ...mutation.data,
          };
        }
      }
      version++;
      return result;
    },
    client: {
      storage: {
        from: () => ({
          remove: async () => {
            if (file.state !== "rejected") {
              throw new Error(
                "Storage disposal began before the metadata fence",
              );
            }
            removed = true;
            return { error: null };
          },
        }),
      },
    },
  };
  await cleanupFile(id, token, db);
  if (!removed || file.state !== "rejected" || job.status !== "complete") {
    throw new Error("Fenced cleanup did not finish");
  }
});
