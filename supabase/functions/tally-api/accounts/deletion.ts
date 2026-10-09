import { CommandDatabase } from "../shared/database.ts";
import { databaseError, HttpsError } from "../shared/errors.ts";
import { exactObject } from "../shared/callable.ts";
import { identifier } from "../shared/validation.ts";
import { Instant } from "../shared/runtime.ts";
import { attachmentBucket } from "../attachments/service.ts";
function input(uid: string, value: unknown) {
  const raw = exactObject(value, ["commandId", "expectedOwnerUid", "payload"]);
  if (identifier(raw.expectedOwnerUid) !== uid) {
    throw new HttpsError("permission-denied", "Your sign-in changed.");
  }
  return { commandId: identifier(raw.commandId), payload: raw.payload };
}
export async function requestAccountDeletion(
  uid: string,
  value: unknown,
  db: CommandDatabase,
  sessionId: string,
) {
  const request = input(uid, value),
    payload = exactObject(request.payload, ["confirmation"]);
  if (payload.confirmation !== "DELETE") {
    throw new HttpsError("invalid-argument", "Confirm account deletion.");
  }
  const { data, error } = await db.client.rpc("tally_request_deletion", {
    owner_id: uid,
    request_id: request.commandId,
    session_id: sessionId,
  });
  if (error?.message === "requires-recent-login") {
    throw new HttpsError(
      "failed-precondition",
      "Sign in again before deleting your account.",
      { reason: "requires-recent-login" },
    );
  }
  if (error) throw databaseError(error);
  return data;
}
export async function getAccountDeletionStatus(
  uid: string,
  value: unknown,
  db: CommandDatabase,
) {
  exactObject(input(uid, value).payload, []);
  const { data, error } = await db.client.rpc("tally_deletion_status", {
    owner_id: uid,
  });
  if (error) throw databaseError(error);
  return { deletion: data };
}
/** Recursive bounded cleanup of the exact owner prefix, including orphan uploads. */
async function erasePrefix(
  db: CommandDatabase,
  prefix: string,
  deadline: number,
): Promise<void> {
  const bucket = db.client.storage.from(attachmentBucket);
  for (;;) {
    if (Date.now() > deadline) {
      throw new HttpsError("deadline-exceeded", "File cleanup continuing.");
    }
    const { data, error } = await bucket.list(prefix, {
      limit: 100,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      throw new HttpsError("unavailable", "Private files unavailable.");
    }
    if (!data?.length) return;
    const objects: string[] = [];
    for (const item of data) {
      if (!/^[A-Za-z0-9_.-]{1,128}$/.test(item.name)) {
        throw new HttpsError("failed-precondition", "Unexpected private path.");
      }
      const path = `${prefix}/${item.name}`;
      if (item.id) objects.push(path);
      else await erasePrefix(db, path, deadline);
    }
    if (objects.length) {
      const { error } = await bucket.remove(objects);
      if (error) {
        throw new HttpsError("unavailable", "Private cleanup delayed.");
      }
    }
  }
}
export async function processDeletions(db: CommandDatabase) {
  const { data, error } = await db.client.rpc("tally_claim_deletions");
  if (error) throw databaseError(error);
  let deleted = 0, deferred = 0;
  for (const job of data) {
    let complete = false, wait = 30;
    try {
      const files = await db.scan(job.userId, "attachments");
      const latest = Math.max(
        0,
        ...files.map((file) =>
          file.uploadLeaseExpiresAt instanceof Instant
            ? file.uploadLeaseExpiresAt.toMillis() + 20000
            : 0
        ),
      );
      if (latest > Date.now()) {
        wait = Math.ceil((latest - Date.now()) / 1000);
        throw new HttpsError("aborted", "Waiting for private uploads to end.");
      }
      await erasePrefix(
        db,
        `users/${identifier(job.userId)}/attachments`,
        Date.now() + 60000,
      );
      // Auth deletion cascades profiles, every owner-qualified table, and receipts.
      const removed = await db.client.auth.admin.deleteUser(job.userId);
      if (removed.error && removed.error.code !== "user_not_found") {
        throw new HttpsError("unavailable", "Identity cleanup delayed.");
      }
      complete = true;
      deleted++;
    } catch {
      deferred++;
    }
    const finished = await db.client.rpc("tally_finish_deletion", {
      owner_id: job.userId,
      token: job.token,
      finished: complete,
      wait_seconds: wait,
    });
    if (finished.error) throw databaseError(finished.error);
  }
  return { deleted, deferred };
}
