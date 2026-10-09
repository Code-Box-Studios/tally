import { createHash } from "node:crypto";
import { CommandDatabase } from "../shared/database.ts";
import { executeMetadataCommand } from "../shared/commands.ts";
import { Audit, Instant } from "../shared/runtime.ts";
import { HttpsError } from "../shared/errors.ts";
import { leaseMatches } from "../jobs/leases.ts";
import { attachmentBucket } from "./service.ts";

/** Commit the terminal disposal state before touching external Storage bytes. */
export async function cleanupFile(
  id: string,
  token: string,
  db: CommandDatabase,
) {
  const initial = await db.readJob(id);
  if (!initial) {
    throw new HttpsError("failed-precondition", "Cleanup job unavailable.");
  }
  const uid = initial.userId;
  const commandId = (phase: string) =>
    `cleanup-${
      createHash("sha256").update(JSON.stringify([id, token, phase])).digest(
        "hex",
      )
    }`;
  const envelope = (phase: string) => ({
    commandId: commandId(phase),
    expectedOwnerUid: uid,
    payload: { id, token },
  });
  const claim = await executeMetadataCommand(
    uid,
    envelope("fence"),
    "fenceFileDisposal",
    (x) => x,
    async (context) => {
      const job = await context.readSystemJob(id);
      const guard = () => {
        if (
          !job ||
          !leaseMatches(job as Parameters<typeof leaseMatches>[0], token) ||
          !(job.leaseExpiresAt instanceof Instant) ||
          job.leaseExpiresAt.toMillis() <= Date.now()
        ) throw new HttpsError("aborted", "Cleanup changed.");
      };
      guard();
      context.beforeCommit(guard);
      const current = await context.maybeRead("attachments", job!.subjectId);
      const expired = current?.expiresAt instanceof Instant &&
        current.expiresAt.toMillis() <= Date.now();
      const remove = !!current &&
        (current.state === "deleted" || current.state === "rejected" ||
          (["awaitingUpload", "processing"].includes(current.state) &&
            expired));
      if (remove) {
        if (
          current!.storagePath !==
            `users/${uid}/attachments/${current!.attachmentId}/content`
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Private cleanup path unavailable.",
          );
        }
        if (
          current!.uploadLeaseExpiresAt instanceof Instant &&
          current!.uploadLeaseExpiresAt.toMillis() + 20000 > Date.now()
        ) throw new HttpsError("aborted", "Upload is still ending.");
        if (!["deleted", "rejected"].includes(current!.state)) {
          context.update("attachments", current!.attachmentId, {
            state: "rejected",
            rejectionReason: "uploadExpired",
            revision: current!.revision + 1,
            uploadToken: null,
            uploadLeaseExpiresAt: null,
          });
        }
      }
      return {
        remove,
        path: remove ? current!.storagePath : null,
        attachmentId: current?.attachmentId ?? null,
      };
    },
    db,
  );
  if (claim.remove) {
    // Renewed/reclaimed leases cannot make a terminal file writable again.
    await db.profile(uid);
    const { error } = await db.client.storage.from(attachmentBucket).remove([
      claim.path!,
    ]);
    if (error) throw new HttpsError("unavailable", "File cleanup delayed.");
  }
  return executeMetadataCommand(
    uid,
    envelope("complete"),
    "completeFileDisposal",
    (x) => x,
    async (context) => {
      const job = await context.readSystemJob(id);
      if (
        !job || !leaseMatches(job as Parameters<typeof leaseMatches>[0], token)
      ) throw new HttpsError("aborted", "Cleanup changed.");
      if (claim.remove) {
        const current = await context.read("attachments", claim.attachmentId!);
        if (
          !["deleted", "rejected"].includes(current.state) ||
          current.storagePath !== claim.path
        ) throw new HttpsError("aborted", "Cleanup changed.");
        context.update("attachments", current.attachmentId, {
          storageRemovedAt: Audit.serverTimestamp(),
          revision: current.revision + 1,
        });
      }
      context.systemJob(id, {
        status: "complete",
        nextRunAt: null,
        generation: job.generation + 1,
        leaseToken: null,
        leaseGeneration: null,
        leaseExpiresAt: null,
      }, true);
      return { removed: claim.remove };
    },
    db,
  );
}
