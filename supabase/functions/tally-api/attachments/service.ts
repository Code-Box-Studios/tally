import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { CommandDatabase } from "../shared/database.ts";
import {
  executeMetadataCommand,
  type OwnerCommandContext,
} from "../shared/commands.ts";
import { Audit, Instant, type RecordData } from "../shared/runtime.ts";
import { exactObject } from "../shared/callable.ts";
import { HttpsError } from "../shared/errors.ts";
import { identifier, revision } from "../shared/validation.ts";
import {
  type AttachmentReservationPayload,
  maxAttachmentBytes,
  maxAttachmentsPerTarget,
  sniffAttachment,
  validateAttachmentReservation,
} from "./policy.ts";

export const attachmentBucket = "tally-attachments";
const pathFor = (uid: string, id: string) =>
  `users/${uid}/attachments/${id}/content`;
const cleanupId = (uid: string, id: string) =>
  `fileCleanup-${
    createHash("sha256").update(JSON.stringify([uid, id])).digest("hex")
  }`;
function envelope(uid: string, input: unknown) {
  const raw = exactObject(input, ["commandId", "expectedOwnerUid", "payload"]);
  const commandId = identifier(raw.commandId);
  if (identifier(raw.expectedOwnerUid) !== uid) {
    throw new HttpsError("permission-denied", "Your sign-in changed.");
  }
  return { commandId, payload: raw.payload };
}
async function target(
  context: OwnerCommandContext,
  type: string,
  id: string,
): Promise<RecordData> {
  const linked = await context.read(
    type === "obligation"
      ? "obligations"
      : type === "instance"
      ? "obligationInstances"
      : "payments",
    id,
  );
  const parent = type === "obligation"
    ? linked
    : await context.read("obligations", identifier(linked.obligationId));
  if (linked.currency !== parent.currency) {
    throw new HttpsError(
      "failed-precondition",
      "Attachment target unavailable.",
    );
  }
  return parent;
}
async function file(
  db: CommandDatabase,
  uid: string,
  id: string,
): Promise<RecordData> {
  await db.profile(uid);
  const value = await db.read(uid, "attachments", id);
  if (
    !value || value.attachmentId !== id ||
    value.storagePath !== pathFor(uid, id) || value.userId !== uid ||
    value.schemaVersion !== 1
  ) {
    throw new HttpsError("failed-precondition", "Private file unavailable.");
  }
  return value;
}
export async function reserveAttachment(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  return executeMetadataCommand(
    uid,
    input,
    "reserveAttachment",
    validateAttachmentReservation,
    async (context, payload) => {
      const parent = await target(
        context,
        payload.targetType,
        payload.targetId,
      );
      const records = await db.scan(uid, "attachments");
      if (
        records.filter((item) =>
          item.targetType === payload.targetType &&
          item.targetId === payload.targetId &&
          ["awaitingUpload", "processing", "ready"].includes(item.state)
        ).length >= maxAttachmentsPerTarget
      ) {
        throw new HttpsError(
          "resource-exhausted",
          "This item already has ten files.",
        );
      }
      const id = context.id("attachment"),
        expiresAt = new Date(Date.now() + 86400000);
      context.create("attachments", id, {
        attachmentId: id,
        targetType: payload.targetType,
        targetId: payload.targetId,
        obligationId: parent.obligationId,
        storagePath: pathFor(uid, id),
        filename: payload.filename,
        declaredContentType: payload.contentType,
        declaredSizeBytes: payload.sizeBytes,
        declaredSha256: payload.sha256,
        state: "awaitingUpload",
        revision: 1,
        expiresAt: Instant.fromDate(expiresAt),
        contentType: null,
        sizeBytes: null,
        sha256: null,
        storageGeneration: null,
        finalizedAt: null,
        rejectionReason: null,
        removedAt: null,
      });
      context.systemJob(cleanupId(uid, id), {
        kind: "fileCleanup",
        subjectId: id,
        status: "pending",
        generation: 1,
        nextRunAt: Instant.fromDate(expiresAt),
        attempts: 0,
        leaseToken: null,
        leaseGeneration: null,
        leaseExpiresAt: null,
      }, false);
      context.activity("attachmentAdded", {
        obligationId: parent.obligationId,
        attachmentId: id,
        targetType: payload.targetType,
        targetId: payload.targetId,
        title: parent.title,
      });
      return {
        attachmentId: id,
        revision: 1,
        storagePath: pathFor(uid, id),
        expiresAt: expiresAt.toISOString(),
      };
    },
    db,
  );
}
export async function uploadAttachment(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  const { commandId, payload } = envelope(uid, input),
    raw = exactObject(payload, [
      "attachmentId",
      "expectedRevision",
      "contentBase64",
    ]);
  const id = identifier(raw.attachmentId),
    expectedRevision = revision(raw.expectedRevision),
    encoded = raw.contentBase64;
  if (
    typeof encoded !== "string" || encoded.length < 4 ||
    encoded.length > 4 * Math.ceil(maxAttachmentBytes / 3) ||
    encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Choose a supported file up to 10 MiB.",
    );
  }
  const bytes = Buffer.from(encoded, "base64"),
    checksum = createHash("sha256").update(bytes).digest("hex"),
    mime = sniffAttachment(bytes);
  if (
    bytes.length < 1 || bytes.length > maxAttachmentBytes ||
    bytes.toString("base64") !== encoded || mime === null
  ) {
    throw new HttpsError("invalid-argument", "Unsupported file content.");
  }
  const normalized = {
    attachmentId: id,
    expectedRevision,
    sha256: checksum,
    sizeBytes: bytes.length,
  };
  const receipt = await db.receipt(uid, commandId);
  if (receipt) {
    // The standard executor verifies the full canonical payload hash on retries.
    return executeMetadataCommand(
      uid,
      { commandId, expectedOwnerUid: uid, payload: normalized },
      "uploadAttachment",
      (value) => value,
      async () => {
        throw new HttpsError("internal", "Unexpected receipt.");
      },
      db,
    );
  }
  const token = randomUUID().replaceAll("-", "");
  await executeMetadataCommand(
    uid,
    { commandId: `claim-${token}`, expectedOwnerUid: uid, payload: normalized },
    "claimUpload",
    (value) => value,
    async (context) => {
      const current = await context.read("attachments", id);
      await target(context, current.targetType, current.targetId);
      if (
        current.expiresAt.toMillis() <= Date.now() ||
        current.declaredSizeBytes !== bytes.length ||
        current.declaredContentType !== mime ||
        current.declaredSha256 !== null && current.declaredSha256 !== checksum
      ) {
        throw new HttpsError(
          "failed-precondition",
          "File reservation does not match its content.",
        );
      }
      const first = current.state === "awaitingUpload" &&
        current.revision === expectedRevision;
      const retry = current.state === "processing" &&
        current.uploadCommandId === commandId &&
        current.uploadRevision === expectedRevision &&
        current.uploadSha256 === checksum;
      if (!first && !retry) {
        throw new HttpsError(
          "aborted",
          "This file upload changed.",
        );
      }
      context.update("attachments", id, {
        state: "processing",
        revision: current.revision + 1,
        uploadCommandId: commandId,
        uploadRevision: expectedRevision,
        uploadSha256: checksum,
        uploadToken: token,
        uploadLeaseExpiresAt: Instant.fromMillis(Date.now() + 60000),
      });
      return { claimed: true };
    },
    db,
  );
  const writable = await file(db, uid, id);
  if (
    writable.state !== "processing" || writable.uploadToken !== token ||
    !(writable.uploadLeaseExpiresAt instanceof Instant) ||
    writable.uploadLeaseExpiresAt.toMillis() <= Date.now()
  ) {
    throw new HttpsError("aborted", "File upload changed.");
  }
  const storage = db.client.storage.from(attachmentBucket),
    path = pathFor(uid, id);
  const { error } = await storage.upload(path, bytes, {
    contentType: mime,
    upsert: false,
    cacheControl: "0",
  });
  // Retried immutable creates may already exist. Verify bytes before accepting.
  if (
    error &&
    !(String(error.statusCode) === "409" ||
      String(error.statusCode) === "400" &&
        error.message.toLowerCase().includes("already exists"))
  ) {
    throw new HttpsError(
      "unavailable",
      "Private upload delayed. Retry the same file.",
    );
  }
  const downloaded = await storage.download(path);
  if (
    downloaded.error || !downloaded.data ||
    downloaded.data.size !== bytes.length ||
    createHash("sha256").update(
        new Uint8Array(await downloaded.data.arrayBuffer()),
      ).digest("hex") !== checksum
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Private upload needs verification.",
    );
  }
  return executeMetadataCommand(
    uid,
    { commandId, expectedOwnerUid: uid, payload: normalized },
    "uploadAttachment",
    (value) => value,
    async (context) => {
      const current = await context.read("attachments", id);
      if (
        current.state !== "processing" || current.uploadToken !== token ||
        current.uploadCommandId !== commandId ||
        current.uploadLeaseExpiresAt.toMillis() <= Date.now()
      ) {
        throw new HttpsError("aborted", "File upload changed.");
      }
      await target(context, current.targetType, current.targetId);
      context.beforeCommit(() => {
        if (current.uploadLeaseExpiresAt.toMillis() <= Date.now()) {
          throw new HttpsError("aborted", "File upload changed.");
        }
      });
      context.update("attachments", id, {
        state: "ready",
        revision: current.revision + 1,
        contentType: mime,
        sizeBytes: bytes.length,
        sha256: checksum,
        storageGeneration: "1",
        finalizedAt: Audit.serverTimestamp(),
        uploadToken: null,
        uploadLeaseExpiresAt: null,
      });
      const jobKey = cleanupId(uid, id),
        job = await context.readSystemJob(jobKey);
      if (job) {
        context.systemJob(jobKey, {
          status: "complete",
          nextRunAt: null,
          generation: job.generation + 1,
          leaseToken: null,
          leaseGeneration: null,
          leaseExpiresAt: null,
        }, true);
      }
      context.activity("attachmentReady", {
        obligationId: current.obligationId,
        attachmentId: id,
        title: current.filename,
      });
      return { attachmentId: id, storageGeneration: "1" };
    },
    db,
  );
}
export async function downloadAttachment(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  const { payload } = envelope(uid, input),
    id = identifier(exactObject(payload, ["attachmentId"]).attachmentId);
  const original = await file(db, uid, id);
  if (
    original.state !== "ready" || original.storageGeneration !== "1" ||
    !Number.isSafeInteger(original.sizeBytes) || original.sizeBytes < 1 ||
    original.sizeBytes > maxAttachmentBytes
  ) {
    throw new HttpsError("failed-precondition", "File unavailable.");
  }
  const { data, error } = await db.client.storage.from(attachmentBucket)
    .download(original.storagePath);
  if (error || !data || data.size !== original.sizeBytes) {
    throw new HttpsError("unavailable", "Private download delayed.");
  }
  const bytes = new Uint8Array(await data.arrayBuffer()),
    current = await file(db, uid, id);
  if (
    current.state !== "ready" || current.revision !== original.revision ||
    sniffAttachment(bytes) !== original.contentType ||
    createHash("sha256").update(bytes).digest("hex") !== original.sha256
  ) {
    throw new HttpsError(
      "failed-precondition",
      "File changed during download.",
    );
  }
  return {
    attachmentId: id,
    storageGeneration: "1",
    contentBase64: Buffer.from(bytes).toString("base64"),
  };
}
export async function removeAttachment(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  return executeMetadataCommand(uid, input, "removeAttachment", (value) => {
    const raw = exactObject(value, ["attachmentId", "expectedRevision"]);
    return {
      attachmentId: identifier(raw.attachmentId),
      expectedRevision: revision(raw.expectedRevision),
    };
  }, async (context, payload) => {
    const current = await context.read("attachments", payload.attachmentId);
    if (current.revision !== payload.expectedRevision) {
      throw new HttpsError("aborted", "This file changed.");
    }
    if (current.state === "deleted") {
      throw new HttpsError("failed-precondition", "File already removed.");
    }
    const jobKey = cleanupId(uid, payload.attachmentId),
      job = await context.readSystemJob(jobKey);
    const after = Math.max(
      Date.now(),
      current.uploadLeaseExpiresAt instanceof Instant
        ? current.uploadLeaseExpiresAt.toMillis() + 20000
        : 0,
    );
    context.systemJob(jobKey, {
      kind: "fileCleanup",
      subjectId: payload.attachmentId,
      status: "pending",
      nextRunAt: Instant.fromMillis(after),
      generation: (job?.generation ?? 0) + 1,
      attempts: 0,
      leaseToken: null,
      leaseGeneration: null,
      leaseExpiresAt: null,
    }, job !== null);
    context.update("attachments", payload.attachmentId, {
      state: "deleted",
      revision: current.revision + 1,
      removedAt: Audit.serverTimestamp(),
    });
    context.activity("attachmentRemoved", {
      obligationId: current.obligationId,
      attachmentId: payload.attachmentId,
      title: current.filename,
    });
    return {
      attachmentId: payload.attachmentId,
      revision: current.revision + 1,
      state: "deleted",
    };
  }, db);
}
