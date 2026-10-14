import { exactObject } from "../shared/callable.ts";
import type { CommandDatabase } from "../shared/database.ts";
import { HttpsError } from "../shared/errors.ts";
import { identifier } from "../shared/validation.ts";
import { foldFinancialLedger } from "../payments/ledger.ts";
import type { RecordData } from "../shared/runtime.ts";

/** Read-only, coherent owner snapshot. Never issue a confirmation from cached totals alone. */
export async function getSettlementSnapshot(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  const obligationId = identifier(
    exactObject(input, ["obligationId"]).obligationId,
  );
  const start = await db.profile(uid);
  const parent = await db.read(uid, "obligations", obligationId);
  if (
    !parent || parent.userId !== uid || parent.obligationId !== obligationId
  ) {
    throw new HttpsError("not-found", "This loan is unavailable.");
  }
  if (
    !["owedByMe", "owedToMe", "installment"].includes(parent.type) ||
    parent.lifecycle !== "active" || parent.remainingMinor !== 0 ||
    parent.financialStatus !== "paid"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Only a fully paid loan can have a paid-in-full confirmation.",
    );
  }
  const [allInstances, allPayments, allEvidence, contact] = await Promise.all([
    db.scan(uid, "obligationInstances"),
    db.scan(uid, "payments"),
    db.scan(uid, "paymentEvidence"),
    parent.contactId
      ? db.read(uid, "contacts", identifier(parent.contactId))
      : null,
  ]);
  const instances = allInstances.filter((r) => r.obligationId === obligationId);
  const payments = allPayments.filter((r) => r.obligationId === obligationId);
  const paymentIds = new Set(payments.map((p) => p.paymentId));
  const evidence = allEvidence.filter((r) => paymentIds.has(r.paymentId));
  const ledger = foldFinancialLedger({
    obligations: [parent],
    instances,
    payments,
    paymentEvidence: evidence,
  }, uid);
  if (
    !ledger.effectivePayments.length ||
    ledger.effectivePayments.some((p) =>
      p.provenance === "assumedAutomatic" &&
      !ledger.evidencedPaymentIds.has(p.paymentId)
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Confirm all payments before generating a paid-in-full confirmation.",
    );
  }
  if ((await db.profile(uid)).version !== start.version) {
    throw new HttpsError(
      "aborted",
      "Your records changed. Refresh and try again.",
    );
  }
  const row = (data: RecordData, key: string) => ({
    id: identifier(data[key]),
    data,
  });
  return {
    obligation: row(parent, "obligationId"),
    contact: contact
      ? { id: identifier(parent.contactId), data: contact }
      : null,
    instances: instances.map((r) => row(r, "instanceId")),
    payments: payments.map((r) => row(r, "paymentId")),
    evidence: evidence.map((r) => row(r, "evidenceId")),
    issuedBy: start.data.displayName ?? "",
    timezone: start.data.timezone,
    generatedAt: new Date().toISOString(),
  };
}
