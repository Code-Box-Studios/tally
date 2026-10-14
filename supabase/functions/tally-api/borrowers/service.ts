import { createHash } from "node:crypto";
import { exactObject } from "../shared/callable.ts";
import {
  executeMetadataCommand,
  executeOwnerCommand,
  type OwnerCommandContext,
} from "../shared/commands.ts";
import { CommandDatabase } from "../shared/database.ts";
import { databaseError, HttpsError } from "../shared/errors.ts";
import { Audit, Instant, type RecordData } from "../shared/runtime.ts";
import {
  civilDate,
  enumValue,
  identifier,
  moneyMinor,
  nullableId,
  textValue,
} from "../shared/validation.ts";
import {
  paymentMethods,
  recordFinitePayment,
  validatePaymentDate,
} from "../payments/payment_service.ts";
import {
  assertBorrowerAccess,
  type BorrowerIdentity,
  normalizeInviteEmail,
  sharedLoanProjection,
  verifiedEmail,
} from "./policy.ts";

function shareable(parent: RecordData) {
  if (
    parent.direction !== "owedToMe" ||
    !["owedToMe", "installment"].includes(parent.type)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Only a loan owed to you can be shared with its borrower.",
    );
  }
}

export function createBorrowerShare(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  return executeMetadataCommand(uid, input, "createBorrowerShare", (value) => {
    const raw = exactObject(value, ["obligationId", "email"]);
    return {
      obligationId: identifier(raw.obligationId),
      email: normalizeInviteEmail(raw.email),
    };
  }, async (context, payload) => {
    const parent = await context.read("obligations", payload.obligationId);
    shareable(parent);
    if (parent.lifecycle === "cancelled") {
      throw new HttpsError(
        "failed-precondition",
        "A cancelled loan cannot be shared.",
      );
    }
    const shares = await db.scan(uid, "borrowerShares", 2000);
    const existing = shares.find((row) =>
      row.obligationId === payload.obligationId && row.status !== "revoked"
    );
    if (existing) {
      const expired = existing.status === "invited" &&
        existing.expiresAt instanceof Instant &&
        existing.expiresAt.toMillis() <= Date.now();
      if (!expired && existing.inviteEmail === payload.email) {
        return { shareId: existing.shareId as string };
      }
      if (!expired) {
        throw new HttpsError(
          "failed-precondition",
          "Revoke the current invitation before sharing with another borrower.",
        );
      }
      context.update("borrowerShares", existing.shareId, {
        status: "revoked",
        revokedAt: Audit.serverTimestamp(),
      });
    }
    const id = context.id("borrowerShare");
    context.create("borrowerShares", id, {
      shareId: id,
      obligationId: payload.obligationId,
      inviteEmail: payload.email,
      borrowerId: null,
      status: "invited",
      expiresAt: Instant.fromMillis(Date.now() + 7 * 86400000),
      acceptedAt: null,
      revokedAt: null,
    });
    return { shareId: id };
  }, db);
}

export function revokeBorrowerShare(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  return executeMetadataCommand(uid, input, "revokeBorrowerShare", (value) => ({
    shareId: identifier(exactObject(value, ["shareId"]).shareId),
  }), async (context, { shareId }) => {
    await context.read("borrowerShares", shareId);
    context.update("borrowerShares", shareId, {
      status: "revoked",
      revokedAt: Audit.serverTimestamp(),
    });
    return { shareId };
  }, db);
}

export function reviewBorrowerSubmission(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  const envelope = exactObject(input, [
    "commandId",
    "expectedOwnerUid",
    "payload",
  ]);
  const decision = enumValue(
    exactObject(envelope.payload, [
      "submissionId",
      "decision",
      "reason",
      "paymentMethod",
      "paymentSourceId",
    ]).decision,
    ["approve", "reject"] as const,
  );
  const run = decision === "approve"
    ? executeOwnerCommand
    : executeMetadataCommand;
  return run(uid, input, "reviewBorrowerSubmission", (value) => {
    const raw = exactObject(value, [
      "submissionId",
      "decision",
      "reason",
      "paymentMethod",
      "paymentSourceId",
    ]);
    return {
      submissionId: identifier(raw.submissionId),
      decision: enumValue(raw.decision, ["approve", "reject"] as const),
      reason: textValue(raw.reason, 500),
      paymentMethod: enumValue(raw.paymentMethod, paymentMethods),
      paymentSourceId: nullableId(raw.paymentSourceId),
    };
  }, async (context, payload) => {
    const submission = await context.read(
      "borrowerSubmissions",
      payload.submissionId,
    );
    if (submission.status === "approved" && payload.decision === "approve") {
      return {
        submissionId: payload.submissionId,
        paymentId: submission.paymentId as string,
      };
    }
    if (submission.status === "rejected" && payload.decision === "reject") {
      return { submissionId: payload.submissionId, paymentId: null };
    }
    if (submission.status !== "pending") {
      throw new HttpsError(
        "failed-precondition",
        "This proof has already been reviewed or has not been sent.",
      );
    }
    if (payload.decision === "reject") {
      if (!payload.reason.trim()) {
        throw new HttpsError(
          "invalid-argument",
          "Explain why the proof was rejected.",
        );
      }
      context.update("borrowerSubmissions", payload.submissionId, {
        status: "rejected",
        reason: payload.reason,
        reviewedAt: Audit.serverTimestamp(),
      });
      return { submissionId: payload.submissionId, paymentId: null };
    }
    const parent = await context.read("obligations", submission.obligationId);
    shareable(parent);
    const terms = {
      obligationId: submission.obligationId,
      currency: submission.currency,
      amountMinor: submission.amountMinor,
      paymentDate: submission.paymentDate,
      paymentMethod: payload.paymentMethod,
      paymentSourceId: payload.paymentSourceId,
      notes: [
        "Borrower proof approved.",
        submission.reference ? `Reference: ${submission.reference}` : "",
        submission.message,
      ].filter(Boolean).join("\n"),
    };
    const paid = await recordFinitePayment(
      context,
      parent.type === "installment"
        ? { ...terms, explicitAllocations: null }
        : {
          ...terms,
          obligationInstanceId: identifier(parent.singleInstanceId),
        },
    );
    context.update("borrowerSubmissions", payload.submissionId, {
      status: "approved",
      paymentId: paid.paymentId,
      reason: "",
      reviewedAt: Audit.serverTimestamp(),
    });
    return { submissionId: payload.submissionId, paymentId: paid.paymentId };
  }, db);
}

async function access(
  db: CommandDatabase,
  ownerId: string,
  shareId: string,
  identity: BorrowerIdentity,
  invitation = false,
) {
  await db.profile(ownerId);
  const share = await db.read(ownerId, "borrowerShares", shareId);
  if (!share || share.userId !== ownerId) {
    throw new HttpsError(
      "permission-denied",
      "This shared loan is unavailable.",
    );
  }
  assertBorrowerAccess(share, identity, invitation);
  return share;
}

async function contextAccess(
  context: OwnerCommandContext,
  shareId: string,
  identity: BorrowerIdentity,
  invitation = false,
) {
  const share = await context.read("borrowerShares", shareId);
  assertBorrowerAccess(share, identity, invitation);
  const parent = await context.read("obligations", share.obligationId);
  shareable(parent);
  return { share, parent };
}

function scopedCommand(
  uid: string,
  ownerId: string,
  commandId: string,
  payload: RecordData,
) {
  return {
    expectedOwnerUid: ownerId,
    commandId: "borrower-" +
      createHash("sha256").update(JSON.stringify([uid, commandId])).digest(
        "hex",
      ),
    payload,
  };
}

function submissionView(row: RecordData) {
  return Object.fromEntries(
    [
      "submissionId",
      "shareId",
      "obligationId",
      "amountMinor",
      "currency",
      "paymentDate",
      "reference",
      "message",
      "status",
      "reason",
      "paymentId",
      "createdAt",
      "submittedAt",
      "reviewedAt",
    ].map((key) => [key, row[key] ?? null]),
  );
}

export async function getBorrowerReview(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  const obligationId = identifier(
    exactObject(input, ["obligationId"]).obligationId,
  );
  await db.profile(uid);
  const [shares, submissions, attachments] = await Promise.all([
    db.scan(uid, "borrowerShares", 2000),
    db.scan(uid, "borrowerSubmissions", 10000),
    db.scan(uid, "attachments"),
  ]);
  const visible = submissions.filter((row) =>
    row.obligationId === obligationId && row.status !== "draft"
  );
  const visibleIds = new Set(visible.map((row) => row.submissionId));
  return {
    shares: shares.filter((row) => row.obligationId === obligationId),
    submissions: visible.map(submissionView),
    attachments: attachments.filter((row) =>
      row.obligationId === obligationId &&
      row.targetType === "borrowerSubmission" && visibleIds.has(row.targetId) &&
      row.state === "ready"
    ),
  };
}

export async function borrowerAction(
  uid: string,
  name: string,
  input: unknown,
  db: CommandDatabase,
  identity: BorrowerIdentity,
): Promise<RecordData> {
  if (uid !== identity.id) {
    throw new HttpsError("permission-denied", "Your sign-in changed.");
  }
  const email = verifiedEmail(identity);
  await db.profile(uid);
  if (name === "borrowerList") {
    exactObject(input, []);
    const results = await Promise.all([
      db.client.from("tally_borrower_shares").select("user_id,id,data").eq(
        "borrower_id",
        uid,
      ).eq("status", "active").limit(201),
      db.client.from("tally_borrower_shares").select("user_id,id,data").eq(
        "invite_email",
        email,
      ).eq("status", "invited").limit(201),
    ]);
    const rows = new Map<string, RecordData>();
    for (const result of results) {
      if (result.error) throw databaseError(result.error);
      if (result.data.length > 200) {
        throw new HttpsError(
          "resource-exhausted",
          "Too many invitations. Ask an owner to revoke old invitations.",
        );
      }
      for (const row of result.data) {
        try {
          assertBorrowerAccess(row.data, identity, true);
          const profile = await db.profile(row.user_id);
          const parent = await db.read(
            row.user_id,
            "obligations",
            row.data.obligationId,
          );
          if (!parent) continue;
          shareable(parent);
          rows.set(row.id, {
            ownerId: row.user_id,
            shareId: row.id,
            title: parent.title,
            ownerName: profile.data.displayName || "Tally user",
            status: row.data.status,
            expiresAt: row.data.expiresAt,
          });
        } catch (error) {
          if (
            !(error instanceof HttpsError) ||
            !["permission-denied", "failed-precondition"].includes(error.code)
          ) throw error;
        }
      }
    }
    return { shares: [...rows.values()] };
  }
  const fields: Record<string, string[]> = {
    borrowerAccept: ["commandId"],
    borrowerView: [],
    borrowerDraft: [
      "commandId",
      "amountMinor",
      "paymentDate",
      "reference",
      "message",
    ],
    borrowerSubmit: ["commandId", "submissionId"],
    borrowerWithdraw: ["commandId", "submissionId"],
  };
  if (!fields[name]) {
    throw new HttpsError("invalid-argument", "Unknown borrower action.");
  }
  const raw = exactObject(input, ["ownerId", "shareId", ...fields[name]]);
  const ownerId = identifier(raw.ownerId), shareId = identifier(raw.shareId);
  const share = await access(
    db,
    ownerId,
    shareId,
    identity,
    name === "borrowerAccept",
  );
  if (name === "borrowerView") {
    const start = await db.profile(ownerId);
    const [parent, instances, payments, submissions, attachments] =
      await Promise.all([
        db.read(ownerId, "obligations", share.obligationId),
        db.scan(ownerId, "obligationInstances"),
        db.scan(ownerId, "payments"),
        db.scan(ownerId, "borrowerSubmissions"),
        db.scan(ownerId, "attachments"),
      ]);
    if (!parent) {
      throw new HttpsError("failed-precondition", "Shared loan unavailable.");
    }
    shareable(parent);
    const ownSubmissions = submissions.filter((row) =>
      row.shareId === shareId && row.borrowerId === uid
    );
    const ids = new Set(ownSubmissions.map((row) => row.submissionId));
    await access(db, ownerId, shareId, identity);
    if ((await db.profile(ownerId)).version !== start.version) {
      throw new HttpsError(
        "aborted",
        "The loan changed. Refresh to see the latest balance.",
      );
    }
    return {
      ownerId,
      shareId,
      ownerName: start.data.displayName || "Tally user",
      timezone: start.data.timezone,
      loan: sharedLoanProjection(parent, instances, payments),
      submissions: ownSubmissions.map(submissionView),
      attachments: attachments.filter((row) =>
        row.targetType === "borrowerSubmission" && ids.has(row.targetId) &&
        ["awaitingUpload", "processing", "ready"].includes(row.state)
      ).map((row) =>
        Object.fromEntries(
          [
            "attachmentId",
            "targetId",
            "filename",
            "contentType",
            "sizeBytes",
            "state",
          ].map((key) => [key, row[key] ?? null]),
        )
      ),
    };
  }
  const commandId = identifier(raw.commandId);
  const payload = name === "borrowerDraft"
    ? {
      shareId,
      amountMinor: moneyMinor(raw.amountMinor),
      paymentDate: civilDate(raw.paymentDate),
      reference: textValue(raw.reference, 200),
      message: textValue(raw.message, 1500),
    }
    : ["borrowerSubmit", "borrowerWithdraw"].includes(name)
    ? { shareId, submissionId: identifier(raw.submissionId) }
    : { shareId };
  return executeMetadataCommand(
    ownerId,
    scopedCommand(uid, ownerId, commandId, payload),
    name,
    (value) => value as RecordData,
    async (context, data) => {
      const current = await contextAccess(
        context,
        shareId,
        identity,
        name === "borrowerAccept",
      );
      if (name === "borrowerAccept") {
        if (current.share.status !== "active") {
          context.update("borrowerShares", shareId, {
            status: "active",
            borrowerId: uid,
            acceptedAt: Audit.serverTimestamp(),
          });
        }
        return { shareId };
      }
      if (name === "borrowerDraft") {
        if (
          current.parent.lifecycle === "cancelled" ||
          data.amountMinor > current.parent.remainingMinor
        ) {
          throw new HttpsError(
            "failed-precondition",
            "The amount exceeds the current balance or the loan is cancelled.",
          );
        }
        validatePaymentDate(context, data.paymentDate, current.parent);
        const submissions = await db.scan(ownerId, "borrowerSubmissions");
        if (
          submissions.filter((row) =>
            row.shareId === shareId && ["draft", "pending"].includes(row.status)
          ).length >= 20
        ) {
          throw new HttpsError(
            "resource-exhausted",
            "Wait for existing proofs to be reviewed before adding more.",
          );
        }
        const id = context.id("borrowerSubmission");
        context.create("borrowerSubmissions", id, {
          ...data,
          submissionId: id,
          obligationId: current.parent.obligationId,
          borrowerId: uid,
          currency: current.parent.currency,
          status: "draft",
          reason: "",
          paymentId: null,
          submittedAt: null,
          reviewedAt: null,
        });
        return { submissionId: id };
      }
      const submission = await context.read(
        "borrowerSubmissions",
        data.submissionId,
      );
      if (
        submission.shareId !== shareId || submission.borrowerId !== uid
      ) {
        throw new HttpsError(
          "permission-denied",
          "This proof is unavailable.",
        );
      }
      if (name === "borrowerWithdraw") {
        if (
          !["draft", "pending", "withdrawn"].includes(submission.status)
        ) {
          throw new HttpsError(
            "failed-precondition",
            "This proof has already been reviewed.",
          );
        }
        context.update("borrowerSubmissions", data.submissionId, {
          status: "withdrawn",
          reason: "Withdrawn by borrower.",
          reviewedAt: Audit.serverTimestamp(),
        });
        return { submissionId: data.submissionId, status: "withdrawn" };
      }
      if (submission.status === "draft") {
        context.update(
          "borrowerSubmissions",
          data.submissionId,
          { status: "pending", submittedAt: Audit.serverTimestamp() },
        );
      }
      return {
        submissionId: data.submissionId,
        status: submission.status === "draft" ? "pending" : submission.status,
      };
    },
    db,
  );
}

export {
  access as borrowerAccess,
  contextAccess as borrowerContextAccess,
  scopedCommand as borrowerCommand,
};
