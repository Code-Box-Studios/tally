import type { TallyRepository } from "../../core/backend/repository";
import { todayInZone } from "../../core/domain/date";
import { decodeRow, object, text, type Row } from "../../core/domain/records";
import type { Currency } from "../../core/domain/money";
import { buildStatement } from "./statement";

export interface SettlementInput {
  obligation: Row;
  contact: Row | null;
  instances: Row[];
  payments: Row[];
  evidence: Row[];
  issuedBy: string;
  timezone: string;
  generatedAt: string;
}
export interface Settlement {
  obligationId: string;
  title: string;
  lender: string;
  borrower: string;
  issuedBy: string;
  currency: Currency;
  originalMinor: number;
  paidMinor: number;
  remainingMinor: 0;
  principalMinor: number | null;
  interestMinor: number | null;
  settlementDate: string;
  paymentCount: number;
  generatedAt: string;
  timezone: string;
}

/** Builds a minimal, shareable document without private notes or contact details. */
export function buildSettlement(input: SettlementInput): Settlement {
  const d = input.obligation.data;
  if (
    !["owedByMe", "owedToMe", "installment"].includes(text(d, "type")) ||
    d.lifecycle !== "active" ||
    d.financialStatus !== "paid" ||
    d.remainingMinor !== 0 ||
    !["owedByMe", "owedToMe"].includes(text(d, "direction")) ||
    d.section !== (d.direction === "owedToMe" ? "owedToMe" : "iOwe")
  )
    throw new Error(
      "Only a fully paid loan can have a paid-in-full confirmation.",
    );
  if (d.type === "installment" && input.instances.length < 2)
    throw new Error(
      "The installment schedule is incomplete. Refresh and try again.",
    );
  const contactId = text(d, "contactId", "unassigned");
  if (input.contact && input.contact.id !== contactId)
    throw new Error("The loan's contact could not be verified.");
  const contact = input.contact ?? {
    id: contactId,
    data: { name: "Name not recorded" },
  };
  const statement = buildStatement({
    ...input,
    contact,
    obligations: [{ ...input.obligation, data: { ...d, contactId } }],
    cached: false,
  });
  const account = statement.accounts[0];
  const effective = statement.history.filter(
    (p) => p.entryType === "payment" && !p.reversed,
  );
  if (
    !account ||
    account.originalMinor === null ||
    account.originalMinor <= 0 ||
    account.remainingMinor !== 0 ||
    account.paidMinor !== account.originalMinor ||
    !effective.length ||
    statement.assumedPayments ||
    effective.some(
      (p) =>
        !["manual", "confirmedAutomatic", "assumedAutomatic"].includes(
          p.provenance,
        ),
    )
  )
    throw new Error(
      "Confirmed payment history is required before generating this confirmation.",
    );
  const settlementDate = effective
    .map((p) => p.paymentDate)
    .sort()
    .at(-1)!;
  if (settlementDate > todayInZone(input.timezone, new Date(input.generatedAt)))
    throw new Error("A future payment cannot confirm a completed settlement.");
  const owner = input.issuedBy.trim() || "Name not recorded";
  const counterparty =
    text(contact.data, "displayName", text(contact.data, "name")).trim() ||
    "Name not recorded";
  return {
    obligationId: account.id,
    title: account.title,
    lender: d.direction === "owedToMe" ? owner : counterparty,
    borrower: d.direction === "owedToMe" ? counterparty : owner,
    issuedBy: owner,
    currency: account.currency,
    originalMinor: account.originalMinor,
    paidMinor: account.paidMinor,
    remainingMinor: 0,
    principalMinor: account.principalMinor,
    interestMinor: account.interestMinor,
    settlementDate,
    paymentCount: effective.length,
    generatedAt: input.generatedAt,
    timezone: input.timezone,
  };
}

export async function fetchSettlement(
  repo: TallyRepository,
  obligationId: string,
): Promise<Settlement> {
  repo.check();
  const result = await repo.invoke("getSettlementSnapshot", { obligationId });
  repo.check();
  const rows = (key: string) => {
    if (!Array.isArray(result[key]))
      throw new Error("The confirmation could not be verified.");
    return (result[key] as unknown[]).map((r) => decodeRow(r, repo.owner));
  };
  const obligation = decodeRow(result.obligation, repo.owner);
  if (obligation.id !== obligationId)
    throw new Error("The loan could not be verified.");
  const data = object(result);
  return buildSettlement({
    obligation,
    contact:
      result.contact === null ? null : decodeRow(result.contact, repo.owner),
    instances: rows("instances"),
    payments: rows("payments"),
    evidence: rows("evidence"),
    issuedBy: text(data, "issuedBy"),
    timezone: text(data, "timezone"),
    generatedAt: text(data, "generatedAt"),
  });
}
