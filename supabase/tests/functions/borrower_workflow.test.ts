import assert from "node:assert/strict";
import { createObligation } from "../../functions/tally-api/obligations/obligation_service.ts";
import {
  borrowerAction,
  createBorrowerShare,
  reviewBorrowerSubmission,
  revokeBorrowerShare,
} from "../../functions/tally-api/borrowers/service.ts";
import { borrowerAttachmentAction } from "../../functions/tally-api/borrowers/attachments.ts";
import { HttpsError } from "../../functions/tally-api/shared/errors.ts";
import type {
  CommandDatabase,
  Mutation,
} from "../../functions/tally-api/shared/database.ts";
import type { RecordData } from "../../functions/tally-api/shared/runtime.ts";

const owner = "owner", borrower = "borrower";
const identity = {
  id: borrower,
  email: "borrower@example.com",
  email_confirmed_at: "2026-01-01",
};
const command = (commandId: string, payload: unknown) => ({
  commandId,
  expectedOwnerUid: owner,
  payload,
});

async function fixture() {
  const audit = { userId: owner, schemaVersion: 1 };
  const records = new Map<string, RecordData>([["ledgerState/current", {
    ...audit,
    revision: 1,
  }], ["categories/test", { ...audit, active: true, name: "Test" }]]);
  const receipts = new Map<string, RecordData>();
  let version = 1;
  const db = {
    profile: async (uid: string) => ({
      data: {
        ...audit,
        userId: uid,
        timezone: "Asia/Manila",
        accountStatus: "active",
        displayName: "Owner",
      },
      version,
    }),
    receipt: async (_uid: string, id: string) => receipts.get(id) ?? null,
    read: async (_uid: string, collection: string, id: string) =>
      records.get(`${collection}/${id}`) ?? null,
    scan: async (_uid: string, collection: string) =>
      [...records].filter(([key]) => key.startsWith(collection + "/")).map((
        [, row],
      ) => row),
    commit: async (
      _uid: string,
      id: string,
      type: string,
      hash: string,
      expected: number,
      mutations: Mutation[],
      result: unknown,
    ) => {
      if (expected !== version) throw new HttpsError("aborted", "Changed");
      for (const mutation of mutations) {
        records.set(`${mutation.collection}/${mutation.id}`, {
          ...audit,
          ...records.get(`${mutation.collection}/${mutation.id}`),
          ...mutation.data,
        });
      }
      version++;
      receipts.set(id, { commandType: type, payloadHash: hash, result });
      return result;
    },
  } as unknown as CommandDatabase;
  const loan = await createObligation(
    owner,
    command("loan", {
      title: "Laptop",
      description: "",
      notes: "Private",
      direction: "owedToMe",
      currency: "PHP",
      amountMinor: 10000,
      originationDate: "2020-01-01",
      dueDate: "2090-02-01",
      contactId: null,
      categoryId: "test",
      paymentSourceId: null,
      interestInfo: null,
    }),
    db,
  );
  const share = await createBorrowerShare(
    owner,
    command("share", {
      obligationId: loan.obligationId,
      email: identity.email,
    }),
    db,
  );
  return { db, records, loan, share };
}

Deno.test("borrower draft and submission do not change a balance; approval commits one payment", async () => {
  const { db, records, loan, share } = await fixture();
  await borrowerAction(
    borrower,
    "borrowerAccept",
    { ownerId: owner, shareId: share.shareId, commandId: "accept" },
    db,
    identity,
  );
  const draft = await borrowerAction(
    borrower,
    "borrowerDraft",
    {
      ownerId: owner,
      shareId: share.shareId,
      commandId: "draft",
      amountMinor: 2500,
      paymentDate: "2020-01-02",
      reference: "000123",
      message: "Paid via transfer",
    },
    db,
    identity,
  );
  await borrowerAction(
    borrower,
    "borrowerSubmit",
    {
      ownerId: owner,
      shareId: share.shareId,
      submissionId: draft.submissionId,
      commandId: "submit",
    },
    db,
    identity,
  );
  assert.equal(
    records.get(`obligations/${loan.obligationId}`)!.remainingMinor,
    10000,
  );
  const payload = {
    submissionId: draft.submissionId,
    decision: "approve",
    reason: "",
    paymentMethod: "bankTransfer",
    paymentSourceId: null,
  };
  const approved = await reviewBorrowerSubmission(
    owner,
    command("approve", payload),
    db,
  );
  assert.equal(
    records.get(`obligations/${loan.obligationId}`)!.remainingMinor,
    7500,
  );
  assert.equal(
    records.get(`borrowerSubmissions/${draft.submissionId}`)!.paymentId,
    approved.paymentId,
  );
  await reviewBorrowerSubmission(owner, command("approve", payload), db);
  await reviewBorrowerSubmission(
    owner,
    command("another-review-id", payload),
    db,
  );
  assert.equal(
    [...records.keys()].filter((key) => key.startsWith("payments/")).length,
    1,
  );
  assert.match(records.get(`payments/${approved.paymentId}`)!.notes, /000123/);
});

Deno.test("borrower access checks reject another account and revoked writes", async () => {
  const { db, share } = await fixture();
  const input = { ownerId: owner, shareId: share.shareId, commandId: "accept" };
  await assert.rejects(() =>
    borrowerAction("stranger", "borrowerAccept", input, db, {
      ...identity,
      id: "stranger",
      email: "stranger@example.com",
    })
  );
  await borrowerAction(borrower, "borrowerAccept", input, db, identity);
  await revokeBorrowerShare(
    owner,
    command("revoke", { shareId: share.shareId }),
    db,
  );
  await assert.rejects(() =>
    borrowerAction(
      borrower,
      "borrowerDraft",
      {
        ...input,
        commandId: "draft",
        amountMinor: 100,
        paymentDate: "2020-01-02",
        reference: "",
        message: "",
      },
      db,
      identity,
    )
  );
});

Deno.test("rejection preserves the balance and approval cannot override it", async () => {
  const { db, share, loan, records } = await fixture();
  const input = { ownerId: owner, shareId: share.shareId };
  await borrowerAction(
    borrower,
    "borrowerAccept",
    { ...input, commandId: "accept" },
    db,
    identity,
  );
  const draft = await borrowerAction(
    borrower,
    "borrowerDraft",
    {
      ...input,
      commandId: "draft",
      amountMinor: 100,
      paymentDate: "2020-01-02",
      reference: "",
      message: "",
    },
    db,
    identity,
  );
  await borrowerAction(
    borrower,
    "borrowerSubmit",
    { ...input, commandId: "submit", submissionId: draft.submissionId },
    db,
    identity,
  );
  const payload = {
    submissionId: draft.submissionId,
    decision: "reject",
    reason: "Transfer not received",
    paymentMethod: "other",
    paymentSourceId: null,
  };
  await reviewBorrowerSubmission(owner, command("reject", payload), db);
  assert.equal(
    records.get(`obligations/${loan.obligationId}`)!.remainingMinor,
    10000,
  );
  await assert.rejects(() =>
    reviewBorrowerSubmission(
      owner,
      command("approve", { ...payload, decision: "approve" }),
      db,
    )
  );
});

Deno.test("proof file reservation is scoped to the borrower's draft and is fenced by revocation", async () => {
  const { db, records, share } = await fixture();
  const input = { ownerId: owner, shareId: share.shareId };
  await borrowerAction(
    borrower,
    "borrowerAccept",
    { ...input, commandId: "accept" },
    db,
    identity,
  );
  const draft = await borrowerAction(
    borrower,
    "borrowerDraft",
    {
      ...input,
      commandId: "draft",
      amountMinor: 100,
      paymentDate: "2020-01-02",
      reference: "",
      message: "",
    },
    db,
    identity,
  );
  const request = {
    ...input,
    submissionId: draft.submissionId,
    commandId: "reserve",
    payload: {
      filename: "receipt.png",
      contentType: "image/png",
      sizeBytes: 100,
      sha256: null,
    },
  };
  const file = await borrowerAttachmentAction(
    borrower,
    "borrowerReserveAttachment",
    request,
    db,
    identity,
  );
  const metadata = records.get(`attachments/${file.attachmentId}`)!;
  assert.equal(metadata.targetType, "borrowerSubmission");
  assert.equal(metadata.targetId, draft.submissionId);
  assert.equal(metadata.userId, owner);
  await assert.rejects(() =>
    borrowerAttachmentAction(
      borrower,
      "borrowerReserveAttachment",
      { ...request, commandId: "other", submissionId: "another-draft" },
      db,
      identity,
    )
  );
  await revokeBorrowerShare(
    owner,
    command("revoke", { shareId: share.shareId }),
    db,
  );
  await assert.rejects(() =>
    borrowerAttachmentAction(
      borrower,
      "borrowerReserveAttachment",
      request,
      db,
      identity,
    )
  );
});
