import { exactObject } from "../shared/callable.ts";
import type { OwnerCommandContext } from "../shared/commands.ts";
import type { CommandDatabase } from "../shared/database.ts";
import { HttpsError } from "../shared/errors.ts";
import { identifier } from "../shared/validation.ts";
import {
  downloadAttachment,
  reserveAttachment,
  uploadAttachment,
} from "../attachments/service.ts";
import {
  borrowerAccess,
  borrowerCommand,
  borrowerContextAccess,
} from "./service.ts";
import type { BorrowerIdentity } from "./policy.ts";

export async function borrowerAttachmentAction(
  uid: string,
  name: string,
  input: unknown,
  db: CommandDatabase,
  identity: BorrowerIdentity,
) {
  if (identity.id !== uid) {
    throw new HttpsError("permission-denied", "Your sign-in changed.");
  }
  await db.profile(uid);
  const raw = exactObject(input, [
    "ownerId",
    "shareId",
    "submissionId",
    "commandId",
    "payload",
  ]);
  const ownerId = identifier(raw.ownerId),
    shareId = identifier(raw.shareId),
    submissionId = identifier(raw.submissionId),
    commandId = identifier(raw.commandId);
  await borrowerAccess(db, ownerId, shareId, identity);
  const upload = name === "borrowerUploadAttachment",
    download = name === "borrowerDownloadAttachment";
  if (!upload && !download && name !== "borrowerReserveAttachment") {
    throw new HttpsError("invalid-argument", "Unknown attachment action.");
  }
  const payload = exactObject(
    raw.payload,
    upload
      ? ["attachmentId", "expectedRevision", "contentBase64"]
      : download
      ? ["attachmentId"]
      : ["filename", "contentType", "sizeBytes", "sha256"],
  );
  const checkSubmission = async (
    read: (collection: string, id: string) => Promise<unknown>,
  ) => {
    const submission = await read("borrowerSubmissions", submissionId) as
      | Record<string, unknown>
      | null;
    if (
      !submission || submission.shareId !== shareId ||
      submission.borrowerId !== uid ||
      (!download && submission.status !== "draft")
    ) {
      throw new HttpsError(
        "permission-denied",
        "Only your unfinished proof can receive a file.",
      );
    }
    if (upload || download) {
      const file = await read(
        "attachments",
        identifier(payload.attachmentId),
      ) as Record<string, unknown> | null;
      if (
        !file || file.targetType !== "borrowerSubmission" ||
        file.targetId !== submissionId
      ) {
        throw new HttpsError(
          "permission-denied",
          "This private file is unavailable.",
        );
      }
    }
  };
  await checkSubmission((collection, id) => db.read(ownerId, collection, id));
  const guard = async (context: OwnerCommandContext) => {
    await borrowerContextAccess(context, shareId, identity);
    await checkSubmission((collection, id) => context.read(collection, id));
  };
  const envelope = borrowerCommand(
    uid,
    ownerId,
    commandId,
    upload || download ? payload : {
      ...payload,
      targetType: "borrowerSubmission",
      targetId: submissionId,
    },
  );
  if (download) {
    const result = await downloadAttachment(ownerId, envelope, db);
    await borrowerAccess(db, ownerId, shareId, identity);
    await checkSubmission((collection, id) => db.read(ownerId, collection, id));
    return result;
  }
  return upload
    ? uploadAttachment(ownerId, envelope, db, guard)
    : reserveAttachment(ownerId, envelope, db, guard);
}
