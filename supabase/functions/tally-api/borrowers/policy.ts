import { HttpsError } from "../shared/errors.ts";
import { Instant, type RecordData } from "../shared/runtime.ts";

export interface BorrowerIdentity {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  is_anonymous?: boolean;
}

export function normalizeInviteEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "Enter the borrower's email.");
  }
  const email = value.trim().toLowerCase();
  if (
    email.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)
  ) {
    throw new HttpsError("invalid-argument", "Enter a valid email address.");
  }
  return email;
}

export function verifiedEmail(identity: BorrowerIdentity): string {
  if (
    !identity.email_confirmed_at || identity.is_anonymous || !identity.email
  ) {
    throw new HttpsError(
      "permission-denied",
      "Verify your email before opening a shared loan.",
    );
  }
  return normalizeInviteEmail(identity.email);
}

export function assertBorrowerAccess(
  share: RecordData,
  identity: BorrowerIdentity,
  allowInvitation = false,
): void {
  const email = verifiedEmail(identity);
  if (identity.id === share.userId) {
    throw new HttpsError(
      "permission-denied",
      "Open this loan in your own obligations.",
    );
  }
  if (share.status === "active" && share.borrowerId === identity.id) return;
  const expiry = share.expiresAt instanceof Instant
    ? share.expiresAt.toMillis()
    : Date.parse(share.expiresAt);
  if (
    allowInvitation && share.status === "invited" && !share.borrowerId &&
    share.inviteEmail === email && expiry > Date.now()
  ) return;
  throw new HttpsError(
    "permission-denied",
    "This shared loan is unavailable or its invitation has expired.",
  );
}

/** Explicit allowlists keep private notes, contact details and source snapshots private. */
export function sharedLoanProjection(
  parent: RecordData,
  instances: RecordData[],
  payments: RecordData[],
): RecordData & { schedule: RecordData[]; payments: RecordData[] } {
  const pick = (record: RecordData, keys: string[]) =>
    Object.fromEntries(keys.map((key) => [key, record[key] ?? null]));
  return {
    ...pick(parent, [
      "obligationId",
      "title",
      "currency",
      "type",
      "lifecycle",
      "financialStatus",
      "originalAmountMinor",
      "totalPaidMinor",
      "remainingMinor",
      "originationDate",
      "dueDate",
    ]),
    schedule: instances.filter((row) =>
      row.obligationId === parent.obligationId
    )
      .map((row) =>
        pick(row, [
          "instanceId",
          "dueDate",
          "amountMinor",
          "totalPaidMinor",
          "remainingMinor",
          "financialStatus",
        ])
      )
      .sort((a, b) =>
        String(a.dueDate ?? "").localeCompare(String(b.dueDate ?? ""))
      ),
    payments: payments.filter((row) => row.obligationId === parent.obligationId)
      .map((row) =>
        pick(row, [
          "paymentId",
          "paymentDate",
          "amountMinor",
          "entryType",
          "reversesPaymentId",
        ])
      )
      .sort((a, b) =>
        String(b.paymentDate).localeCompare(String(a.paymentDate))
      ),
  };
}
