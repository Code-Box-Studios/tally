import { object, type Data } from "../../../core/domain/records";
interface Command {
  id: string;
  owner: string;
  name: string;
  payload: Data;
}
export type Digest = (value: string) => Promise<string>;
const digest: Digest = async (value) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
/** Verify canonical identity and revision before acknowledging a durable save. */
export async function validateReceipt(
  c: Command,
  result: Data,
  hash: Digest = digest,
): Promise<Data> {
  const r = object(result),
    p = c.payload;
  const id = (key: string, expected?: unknown) => {
    const value = r[key];
    if (
      typeof value !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(value) ||
      (expected != null && value !== expected)
    )
      throw new Error("Invalid receipt identity.");
    return value;
  };
  const positive = (key: string) => {
    if (!Number.isSafeInteger(r[key]) || Number(r[key]) < 1)
      throw new Error("Invalid receipt revision.");
  };
  const predicted = async (role: string) =>
    role + "-" + (await hash(JSON.stringify([`${c.owner}:${c.id}`, role])));
  const obligation = async (created = false) =>
    id(
      "obligationId",
      created ? await predicted("obligation") : p.obligationId,
    );
  const allocations = (key: string, min: number, max: number) => {
    const values = r[key];
    if (!Array.isArray(values) || values.length < min || values.length > max)
      throw new Error("Invalid allocation receipt.");
    const seen = new Set<string>();
    for (const raw of values) {
      const v = object(raw);
      if (
        typeof v.instanceId !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(v.instanceId) ||
        !Number.isSafeInteger(v.instanceRevision) ||
        Number(v.instanceRevision) < 1 ||
        seen.has(v.instanceId)
      )
        throw new Error("Invalid allocation receipt.");
      seen.add(v.instanceId);
    }
    return seen;
  };
  const periods = (installment: boolean) => {
    const period = r.obligationInstanceId;
    if (period == null) {
      if (!installment || r.instanceRevision != null)
        throw new Error("Missing period receipt.");
    } else {
      id("obligationInstanceId", p.obligationInstanceId);
      positive("instanceRevision");
    }
    const revisions = r.allocationRevisions
      ? allocations(
          "allocationRevisions",
          period == null ? 2 : 1,
          installment ? 24 : 48,
        )
      : null;
    if (period == null && !revisions)
      throw new Error("Missing allocation receipt.");
    if (
      period != null &&
      revisions &&
      (revisions.size !== 1 || !revisions.has(String(period)))
    )
      throw new Error("Mismatched period receipt.");
    if (Array.isArray(p.explicitAllocations)) {
      const expected = new Set(
          p.explicitAllocations.map((a) => String(object(a).instanceId)),
        ),
        actual = revisions ?? new Set([String(period)]);
      if (
        expected.size !== actual.size ||
        [...expected].some((i) => !actual.has(i))
      )
        throw new Error("Mismatched allocations.");
    }
  };
  switch (c.name) {
    case "createObligation":
    case "editObligation":
    case "cancelObligation":
      await obligation(c.name === "createObligation");
      id(
        "obligationInstanceId",
        c.name === "createObligation"
          ? await predicted("instance")
          : p.obligationInstanceId,
      );
      positive("obligationRevision");
      positive("instanceRevision");
      break;
    case "createInstallment":
    case "editInstallment":
    case "cancelInstallment":
      await obligation(c.name === "createInstallment");
      positive("obligationRevision");
      {
        const ids = r.obligationInstanceIds,
          seen = allocations("instanceRevisions", 2, 120);
        if (
          !Array.isArray(ids) ||
          ids.length !== seen.size ||
          ids.some((i) => !seen.has(String(i)))
        )
          throw new Error("Invalid installment receipt.");
      }
      break;
    case "recordPayment":
    case "recordInstallmentPayment":
      await obligation();
      id("paymentId");
      positive("obligationRevision");
      periods(c.name === "recordInstallmentPayment");
      break;
    case "correctPayment":
      await obligation();
      id("originalPaymentId", p.paymentId);
      id("reversalId");
      if (
        r.reversalId === r.originalPaymentId ||
        (p.replacement == null) !== (r.replacementId == null)
      )
        throw new Error("Invalid correction receipt.");
      if (r.replacementId != null) {
        id("replacementId");
        if (
          r.replacementId === r.reversalId ||
          r.replacementId === r.originalPaymentId
        )
          throw new Error("Invalid replacement.");
      }
      positive("obligationRevision");
      periods(true);
      break;
    case "createRecurring":
    case "editRecurring":
    case "changeRecurringLifecycle":
      await obligation(c.name === "createRecurring");
      positive("obligationRevision");
      positive("generationRevision");
      break;
    case "setRecurringAmount":
    case "editRecurringInstance":
    case "skipRecurringInstance":
      await obligation();
      id("instanceId", p.instanceId);
      positive("instanceRevision");
      break;
    case "confirmDeduction":
    case "reportDeductionFailure":
      await obligation();
      id("instanceId", p.instanceId);
      positive("instanceRevision");
      positive("obligationRevision");
      if (c.name === "confirmDeduction") {
        id("paymentId");
        if (r.evidenceId != null) id("evidenceId");
      } else {
        if (r.reversalId != null) id("reversalId");
        id("attemptId");
      }
      break;
    case "saveCatalog":
      id("id", p.id ?? (await predicted(String(p.kind))));
      positive("revision");
      break;
    case "setObligationReminder":
      await obligation();
      positive("obligationRevision");
      positive("reminderRevision");
      break;
    case "updateNotificationPreferences":
      positive("preferenceRevision");
      break;
    case "markReminderRead":
      id("reminderId", p.reminderId);
      positive("reminderRevision");
      break;
    default:
      throw new Error("Unknown command receipt.");
  }
  return JSON.parse(JSON.stringify(r));
}
