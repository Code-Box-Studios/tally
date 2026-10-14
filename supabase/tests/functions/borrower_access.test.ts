import assert from "node:assert/strict";
import {
  assertBorrowerAccess,
  normalizeInviteEmail,
  sharedLoanProjection,
} from "../../functions/tally-api/borrowers/policy.ts";

const identity = {
  id: "borrower",
  email: "person@example.com",
  email_confirmed_at: "2026-01-01",
  is_anonymous: false,
};
const share = {
  userId: "owner",
  shareId: "share",
  status: "invited",
  inviteEmail: "person@example.com",
  borrowerId: null,
  expiresAt: "2099-01-01T00:00:00Z",
};

Deno.test("borrower invitations require the verified matching identity", () => {
  assert.equal(
    normalizeInviteEmail(" Person@Example.com "),
    "person@example.com",
  );
  assert.doesNotThrow(() => assertBorrowerAccess(share, identity, true));
  for (
    const changed of [
      { ...identity, email: "stranger@example.com" },
      { ...identity, email_confirmed_at: null },
      { ...identity, is_anonymous: true },
      { ...identity, id: "owner" },
    ]
  ) assert.throws(() => assertBorrowerAccess(share, changed, true));
  assert.throws(() => assertBorrowerAccess(share, identity));
  assert.throws(() =>
    assertBorrowerAccess(
      { ...share, expiresAt: "2020-01-01T00:00:00Z" },
      identity,
      true,
    )
  );
});

Deno.test("accepted shares bind to an identity and revocation denies further access", () => {
  const active = { ...share, status: "active", borrowerId: identity.id };
  assert.doesNotThrow(() => assertBorrowerAccess(active, identity));
  assert.throws(() =>
    assertBorrowerAccess(
      active,
      { ...identity, id: "replacement-account" },
      true,
    )
  );
  assert.throws(() =>
    assertBorrowerAccess({ ...active, status: "revoked" }, identity, true)
  );
});

Deno.test("shared projections exclude owner notes, contacts, source details and other loans", () => {
  const result = sharedLoanProjection({
    obligationId: "loan",
    title: "Laptop",
    currency: "PHP",
    type: "lent",
    direction: "owedToMe",
    originalAmountMinor: 11000,
    totalPaidMinor: 1000,
    remainingMinor: 10000,
    originationDate: "2026-01-01",
    dueDate: "2026-11-01",
    notes: "SECRET",
    contactId: "private-contact",
    paymentSourceId: "bank",
    interestInfo: {
      calculationVersion: 1,
      principalMinor: 10000,
      interestMinor: 1000,
    },
  }, [
    {
      obligationId: "loan",
      obligationInstanceId: "period",
      dueDate: "2026-11-01",
      amountMinor: 11000,
      totalPaidMinor: 1000,
      remainingMinor: 10000,
      status: "partiallyPaid",
      notes: "SECRET",
    },
    {
      obligationId: "other",
      obligationInstanceId: "other-period",
      amountMinor: 999,
    },
  ], [
    {
      obligationId: "loan",
      paymentId: "payment",
      paymentDate: "2026-03-01",
      amountMinor: 1000,
      entryType: "payment",
      notes: "SECRET",
      sourceSnapshot: { lastFour: "1234" },
    },
    { obligationId: "other", paymentId: "other-payment", amountMinor: 999 },
  ]);
  assert.equal(result.remainingMinor, 10000);
  assert.equal(result.schedule.length, 1);
  assert.equal(result.payments.length, 1);
  const json = JSON.stringify(result);
  for (
    const secret of [
      "SECRET",
      "private-contact",
      "1234",
      "other-period",
      "other-payment",
      "paymentSourceId",
    ]
  ) assert.equal(json.includes(secret), false);
});
