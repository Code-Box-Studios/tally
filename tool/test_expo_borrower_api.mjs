import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID, randomBytes, createHash } from "node:crypto";

const cli = process.env.TALLY_SUPABASE_CLI ?? "/home/jess/.local/share/tally-tools/supabase-2.120.0/supabase";
const status = JSON.parse(spawnSync(cli, ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).stdout);
assert.equal(status.API_URL, "http://127.0.0.1:56321", "Use the isolated local Tally stack");
const accounts = [], storedPaths = [];
async function request(path, token, body, method = "POST", expected = 200) {
  const response = await fetch(status.API_URL + path, { method, headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body == null ? undefined : JSON.stringify(body) });
  const value = await response.json();
  if (response.status !== expected) throw new Error(`${method} ${path.split("?")[0]} expected ${expected}, received ${response.status}: ${JSON.stringify(value)}`);
  return value;
}
async function account(role) {
  const email = `tally-borrower-${role}-${randomUUID()}@example.test`, password = randomBytes(24).toString("base64url");
  const user = await request("/auth/v1/admin/users", status.SERVICE_ROLE_KEY, { email, password, email_confirm: true });
  accounts.push(user);
  const session = await request("/auth/v1/token?grant_type=password", status.ANON_KEY, { email, password });
  const userContext = { id: user.id, email, token: session.access_token };
  await invoke(userContext, "bootstrapUser", {});
  return userContext;
}
async function invoke(user, name, input, expected = 200) {
  const value = await request("/functions/v1/tally-api", user.token, { name, input }, "POST", expected);
  return expected === 200 ? value.result : value;
}
const command = (user, name, payload, id = randomUUID()) => invoke(user, name, { commandId: id, expectedOwnerUid: user.id, payload });
try {
  const owner = await account("owner"), borrower = await account("recipient"), stranger = await account("stranger");
  const categories = await request("/rest/v1/tally_categories?select=id&limit=1", owner.token, null, "GET");
  const loan = await command(owner, "createObligation", { title: "Borrower integration loan", description: "Owner-only description", notes: "OWNER_PRIVATE_NOTE", direction: "owedToMe", currency: "PHP", amountMinor: 10000, originationDate: "2020-01-01", dueDate: "2090-02-01", contactId: null, categoryId: categories[0].id, paymentSourceId: null, interestInfo: null });
  const invitation = await command(owner, "createBorrowerShare", { obligationId: loan.obligationId, email: borrower.email });
  const scope = { ownerId: owner.id, shareId: invitation.shareId };
  assert.equal((await invoke(borrower, "borrowerList", {})).shares.length, 1);
  assert.equal((await invoke(stranger, "borrowerList", {})).shares.length, 0);
  await invoke(stranger, "borrowerAccept", { ...scope, commandId: randomUUID() }, 403);
  await invoke(borrower, "borrowerView", scope, 403);
  await invoke(borrower, "borrowerAccept", { ...scope, commandId: randomUUID() });
  const shared = await invoke(borrower, "borrowerView", scope);
  assert.equal(shared.loan.remainingMinor, 10000);
  assert.equal(shared.loan.schedule.length, 1);
  assert.equal(JSON.stringify(shared).includes("OWNER_PRIVATE_NOTE"), false);
  assert.equal(JSON.stringify(shared).includes("Owner-only description"), false);
  for (const table of ["tally_obligations", "tally_payments", "tally_borrower_shares", "tally_borrower_submissions"]) {
    assert.deepEqual(await request(`/rest/v1/${table}?select=id&user_id=eq.${owner.id}`, borrower.token, null, "GET"), []);
  }
  console.log("PASS verified invitation, sanitized shared loan, and direct RLS isolation");

  const draftInput = { ...scope, commandId: randomUUID(), amountMinor: 2500, paymentDate: "2020-01-02", reference: "000123", message: "Transfer sent" };
  const draft = await invoke(borrower, "borrowerDraft", draftInput);
  assert.equal((await invoke(borrower, "borrowerDraft", draftInput)).submissionId, draft.submissionId);
  const proof = { ...scope, submissionId: draft.submissionId };
  const bytes = Buffer.from("%PDF-1.7\nTally synthetic proof\n%%EOF\n"), checksum = createHash("sha256").update(bytes).digest("hex");
  const reserved = await invoke(borrower, "borrowerReserveAttachment", { ...proof, commandId: randomUUID(), payload: { filename: "proof.pdf", contentType: "application/pdf", sizeBytes: bytes.length, sha256: checksum } });
  storedPaths.push(reserved.storagePath);
  const upload = { ...proof, commandId: randomUUID(), payload: { attachmentId: reserved.attachmentId, expectedRevision: reserved.revision, contentBase64: bytes.toString("base64") } };
  await invoke(borrower, "borrowerUploadAttachment", upload);
  await invoke(borrower, "borrowerUploadAttachment", upload);
  const beforeSend = await invoke(owner, "getBorrowerReview", { obligationId: loan.obligationId });
  assert.equal(beforeSend.submissions.length, 0);
  assert.equal(beforeSend.attachments.length, 0);
  const download = { ...proof, commandId: randomUUID(), payload: { attachmentId: reserved.attachmentId } };
  assert.equal((await invoke(borrower, "borrowerDownloadAttachment", download)).contentBase64, bytes.toString("base64"));
  await invoke(stranger, "borrowerDownloadAttachment", download, 403);
  await invoke(borrower, "borrowerSubmit", { ...proof, commandId: randomUUID() });
  assert.equal((await invoke(borrower, "borrowerView", scope)).loan.remainingMinor, 10000);
  const pending = await invoke(owner, "getBorrowerReview", { obligationId: loan.obligationId });
  assert.equal(pending.submissions[0].status, "pending");
  assert.equal(pending.attachments.length, 1);
  const review = { submissionId: draft.submissionId, decision: "approve", reason: "", paymentMethod: "bankTransfer", paymentSourceId: null };
  const reviewed = await Promise.all([command(owner, "reviewBorrowerSubmission", review), command(owner, "reviewBorrowerSubmission", review)]);
  assert.equal(reviewed[0].paymentId, reviewed[1].paymentId);
  const paid = await invoke(borrower, "borrowerView", scope);
  assert.equal(paid.loan.remainingMinor, 7500);
  assert.equal(paid.loan.payments.length, 1);
  assert.equal(paid.submissions[0].status, "approved");
  console.log("PASS private proof upload/download, draft visibility, and concurrent exactly-once approval");

  const second = await invoke(borrower, "borrowerDraft", { ...draftInput, commandId: randomUUID(), reference: "second" });
  await invoke(borrower, "borrowerSubmit", { ...scope, submissionId: second.submissionId, commandId: randomUUID() });
  await invoke(borrower, "borrowerWithdraw", { ...scope, submissionId: second.submissionId, commandId: randomUUID() });
  await invoke(owner, "reviewBorrowerSubmission", { commandId: randomUUID(), expectedOwnerUid: owner.id, payload: { ...review, submissionId: second.submissionId } }, 400);
  assert.equal((await invoke(borrower, "borrowerView", scope)).loan.remainingMinor, 7500);
  await command(owner, "revokeBorrowerShare", { shareId: invitation.shareId });
  await invoke(borrower, "borrowerView", scope, 403);
  await invoke(borrower, "borrowerDownloadAttachment", download, 403);
  await invoke(borrower, "borrowerUploadAttachment", upload, 403);
  await invoke(borrower, "borrowerDraft", { ...draftInput, commandId: randomUUID() }, 403);
  assert.equal((await invoke(borrower, "borrowerList", {})).shares.length, 0);
  console.log("PASS proof withdrawal, unchanged balance, and revocation across reads/writes/files");

  await invoke(owner, "getSettlementSnapshot", { obligationId: loan.obligationId }, 400);
  const finalPayment = await command(owner, "recordPayment", {
    obligationId: loan.obligationId, obligationInstanceId: shared.loan.schedule[0].instanceId,
    amountMinor: 7500, currency: "PHP", paymentDate: "2020-02-01",
    paymentSourceId: null, paymentMethod: "cash", notes: "PRIVATE_SETTLEMENT_NOTE",
  });
  const settled = await invoke(owner, "getSettlementSnapshot", { obligationId: loan.obligationId });
  assert.equal(settled.obligation.data.remainingMinor, 0);
  assert.equal(settled.obligation.data.totalPaidMinor, 10000);
  assert.equal(settled.payments.length, 2);
  await invoke(stranger, "getSettlementSnapshot", { obligationId: loan.obligationId }, 400);
  await invoke(borrower, "getSettlementSnapshot", { obligationId: loan.obligationId }, 400);
  await command(owner, "correctPayment", { paymentId: finalPayment.paymentId, reason: "Settlement correction test", replacement: null });
  await invoke(owner, "getSettlementSnapshot", { obligationId: loan.obligationId }, 400);
  console.log("PASS paid confirmation checks full payment, owner isolation, and payment reversal");

} finally {
  if (storedPaths.length) await request("/storage/v1/object/tally-attachments", status.SERVICE_ROLE_KEY, { prefixes: storedPaths }, "DELETE");
  for (const user of accounts.reverse()) await request(`/auth/v1/admin/users/${user.id}`, status.SERVICE_ROLE_KEY, null, "DELETE");
}
