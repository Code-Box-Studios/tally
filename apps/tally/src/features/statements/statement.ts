import { civilDate } from "../../core/domain/date";
import { currency, minor, type Currency } from "../../core/domain/money";
import { addStatementTotals } from "./statement-money";
import {
  amount,
  label,
  object,
  recordTitle,
  text,
  type Row,
} from "../../core/domain/records";

export interface StatementPeriod {
  id: string;
  title: string;
  dueDate: string;
  originalMinor: number | null;
  paidMinor: number;
  remainingMinor: number | null;
  status: string;
  excluded: boolean;
}
export interface StatementAccount {
  id: string;
  title: string;
  currency: Currency;
  section: string;
  status: string;
  excluded: boolean;
  originalMinor: number | null;
  paidMinor: number;
  remainingMinor: number;
  unknownAmounts: number;
  dueDate: string;
  periods: StatementPeriod[];
  principalMinor: number | null;
  interestMinor: number | null;
  interestPolicy: string;
}
export interface StatementEntry {
  id: string;
  obligationId: string;
  title: string;
  currency: Currency;
  direction: string;
  paymentDate: string;
  recordedAt: string;
  entryType: "payment" | "reversal";
  signedAmountMinor: number;
  reversed: boolean;
  reversesPaymentId: string;
  method: string;
  source: string;
  notes: string;
  provenance: string;
  provenanceLabel: string;
  confirmationReference: string;
}
export interface AccountStatement {
  contactId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  issuedBy: string;
  timezone: string;
  generatedAt: string;
  cached: boolean;
  pendingActions: number;
  assumedPayments: number;
  summaries: {
    currency: Currency;
    youOweMinor: number;
    owedToYouMinor: number;
    unknownAmounts: number;
  }[];
  accounts: StatementAccount[];
  history: StatementEntry[];
}
interface StatementInput {
  contact: Row;
  obligations: Row[];
  instances: Row[];
  payments: Row[];
  evidence?: Row[];
  issuedBy: string;
  timezone: string;
  generatedAt: string;
  cached: boolean;
  pendingActions?: number;
}

function add(left: number, right: number): number {
  return addStatementTotals(left, right);
}
function known(row: Row, key: string): number {
  return minor(amount(row.data, key), true);
}
function optionalDate(row: Row, key: string): string {
  const value = text(row.data, key);
  return value ? civilDate(value) : "";
}
function unique(rows: Row[]): Map<string, Row> {
  const result = new Map<string, Row>();
  for (const row of rows) {
    if (result.has(row.id))
      throw new Error(
        "Duplicate records cannot form a statement. Refresh and try again.",
      );
    result.set(row.id, row);
  }
  return result;
}

/** Produces a current snapshot from complete, owner-verified repository collections. */
export function buildStatement(input: StatementInput): AccountStatement {
  if (!Number.isFinite(Date.parse(input.generatedAt)))
    throw new Error("Invalid statement generation date.");
  new Intl.DateTimeFormat("en", { timeZone: input.timezone });
  const allParents = unique(input.obligations);
  unique(input.instances);
  unique(input.payments);
  const evidence = input.evidence ?? [];
  unique(evidence);
  const parents = input.obligations.filter(
    (r) => r.data.contactId === input.contact.id,
  );
  const parentIds = new Set(parents.map((r) => r.id));
  for (const payment of input.payments) {
    if (
      payment.data.contactId === input.contact.id &&
      !allParents.has(text(payment.data, "obligationId"))
    ) {
      throw new Error(
        "A payment's linked obligation is missing. Refresh before generating a statement.",
      );
    }
  }
  const accounts: StatementAccount[] = parents
    .map((parent) => {
      const code = currency(parent.data.currency);
      const section = text(parent.data, "section");
      if (!["iOwe", "owedToMe", "monthlyDues"].includes(section))
        throw new Error("This obligation's direction could not be verified.");
      const excluded =
        parent.data.lifecycle === "cancelled" || parent.data.archived === true;
      const recurring = section === "monthlyDues";
      const periods: StatementPeriod[] = recurring
        ? input.instances
            .filter((r) => r.data.obligationId === parent.id)
            .map((period) => {
              if (currency(period.data.currency) !== code)
                throw new Error(
                  "Billing period currency differs from its obligation.",
                );
              const originalMinor = amount(period.data, "amountMinor");
              const remainingMinor = amount(period.data, "remainingMinor");
              const paidMinor = known(period, "totalPaidMinor");
              if (originalMinor === null) {
                if (remainingMinor !== null || paidMinor !== 0)
                  throw new Error(
                    "An unknown bill amount cannot have confirmed payments or balance.",
                  );
              } else {
                minor(originalMinor, true);
                if (
                  remainingMinor === null ||
                  add(paidMinor, minor(remainingMinor, true)) !== originalMinor
                )
                  throw new Error("Billing period balance needs recovery.");
              }
              return {
                id: period.id,
                title: text(period.data, "periodLabel", "Billing period"),
                dueDate: optionalDate(period, "dueDate"),
                originalMinor,
                paidMinor,
                remainingMinor,
                status: label(text(period.data, "financialStatus")),
                excluded:
                  excluded ||
                  ["cancelled", "skipped"].includes(
                    text(period.data, "financialStatus"),
                  ),
              };
            })
            .sort(
              (a, b) =>
                a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id),
            )
        : [];
      const paidMinor = recurring
        ? periods.reduce((total, p) => add(total, p.paidMinor), 0)
        : known(parent, "totalPaidMinor");
      const included = periods.filter((p) => !p.excluded || excluded);
      const remainingMinor = recurring
        ? included.reduce((total, p) => add(total, p.remainingMinor ?? 0), 0)
        : known(parent, "remainingMinor");
      const unknownAmounts = recurring
        ? included.filter((p) => p.originalMinor === null).length
        : 0;
      const originalMinor = recurring
        ? unknownAmounts
          ? null
          : included.reduce((total, p) => add(total, p.originalMinor ?? 0), 0)
        : known(parent, "originalAmountMinor");
      if (!recurring && add(paidMinor, remainingMinor) !== originalMinor)
        throw new Error("Obligation balance needs recovery.");
      let principalMinor: number | null = null,
        interestMinor: number | null = null,
        interestPolicy = "";
      if (parent.data.interestInfo) {
        const info = object(parent.data.interestInfo);
        if (info.calculationVersion === 1) {
          principalMinor = minor(info.principalMinor);
          interestMinor = minor(info.interestMinor, true);
          if (
            add(principalMinor, interestMinor) !== originalMinor ||
            info.totalMinor !== originalMinor
          )
            throw new Error(
              "Interest breakdown does not match the recorded obligation.",
            );
          const basis = text(info, "basis");
          interestPolicy = `${Number(info.rateBasisPoints) / 100}% · ${basis === "oneTime" ? "Flat one-time charge" : basis === "monthly" ? "Monthly · actual days / 30" : "Annual · actual days / 365"} · Fixed simple interest`;
        } else
          interestPolicy = `Legacy informational interest · ${Number(info.rateBasisPoints) / 100}% · ${text(info, "basis")}. Recorded balance unchanged.`;
      }
      return {
        id: parent.id,
        title: recordTitle(parent),
        currency: code,
        section,
        status: [
          label(text(parent.data, "lifecycle")),
          label(text(parent.data, "financialStatus")),
          parent.data.archived === true ? "Archived" : "",
        ]
          .filter(Boolean)
          .join(" · "),
        excluded,
        originalMinor,
        paidMinor,
        remainingMinor,
        unknownAmounts,
        dueDate: optionalDate(parent, "dueDate"),
        periods,
        principalMinor,
        interestMinor,
        interestPolicy,
      };
    })
    .sort(
      (a, b) =>
        a.currency.localeCompare(b.currency) ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id),
    );

  const scoped = input.payments.filter((r) =>
    parentIds.has(text(r.data, "obligationId")),
  );
  const originals = unique(scoped);
  const reversed = new Set<string>();
  for (const entry of scoped) {
    if (entry.data.entryType !== "reversal") continue;
    const reference = text(entry.data, "reversesPaymentId");
    const original = originals.get(reference);
    if (
      !original ||
      original.data.entryType !== "payment" ||
      reversed.has(reference) ||
      original.data.obligationId !== entry.data.obligationId ||
      original.data.currency !== entry.data.currency ||
      original.data.amountMinor !== entry.data.amountMinor
    )
      throw new Error(
        "A payment reversal could not be verified. Refresh before generating a statement.",
      );
    reversed.add(reference);
  }
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const netPayments = new Map<string, bigint>();
  const history = scoped
    .map<StatementEntry>((entry) => {
      const d = entry.data;
      const parent = accountById.get(text(d, "obligationId"))!;
      const entryType = d.entryType;
      if (entryType !== "payment" && entryType !== "reversal")
        throw new Error(
          "An unsupported payment entry cannot form a statement.",
        );
      const code = currency(d.currency);
      if (code !== parent.currency)
        throw new Error("Payment currency differs from its obligation.");
      const direction = parent.section === "owedToMe" ? "owedToMe" : "owedByMe";
      if (d.direction !== direction)
        throw new Error("Payment direction differs from its obligation.");
      const signedAmountMinor =
        minor(d.amountMinor) * (entryType === "reversal" ? -1 : 1);
      netPayments.set(
        parent.id,
        (netPayments.get(parent.id) ?? 0n) + BigInt(signedAmountMinor),
      );
      const snapshot =
        d.sourceSnapshot &&
        typeof d.sourceSnapshot === "object" &&
        !Array.isArray(d.sourceSnapshot)
          ? d.sourceSnapshot
          : {};
      const recordedAt = text(d, "recordedAt", text(d, "createdAt"));
      if (recordedAt && !Number.isFinite(Date.parse(recordedAt)))
        throw new Error("Payment recorded date could not be verified.");
      const provenance = text(d, "provenance");
      const confirmation = evidence.find(
        (e) =>
          e.data.kind === "userConfirmed" &&
          e.data.paymentId ===
            (entryType === "reversal"
              ? text(d, "reversesPaymentId")
              : entry.id),
      );
      const provenanceLabel =
        provenance === "assumedAutomatic"
          ? confirmation
            ? "Automatic · user-confirmed"
            : "Automatic · unconfirmed / assumed"
          : provenance === "confirmedAutomatic"
            ? "Automatic · user-confirmed"
            : provenance === "manual"
              ? "Manual payment"
              : provenance
                ? label(provenance)
                : "Provenance not recorded";
      return {
        id: entry.id,
        obligationId: parent.id,
        title: parent.title,
        currency: code,
        direction,
        entryType,
        signedAmountMinor,
        paymentDate: civilDate(text(d, "paymentDate")),
        recordedAt,
        reversed: reversed.has(entry.id),
        reversesPaymentId: text(d, "reversesPaymentId"),
        method: label(text(d, "paymentMethod")),
        source: text(snapshot, "name", text(snapshot, "displayName")),
        notes: [text(d, "notes"), text(d, "correctionReason")]
          .filter(Boolean)
          .join(" · "),
        provenance,
        provenanceLabel,
        confirmationReference: confirmation?.id ?? "",
      };
    })
    .sort(
      (a, b) =>
        (a.recordedAt || a.paymentDate).localeCompare(
          b.recordedAt || b.paymentDate,
        ) || a.id.localeCompare(b.id),
    );
  for (const account of accounts) {
    if ((netPayments.get(account.id) ?? 0n) !== BigInt(account.paidMinor))
      throw new Error(
        "Payment history does not match the confirmed balance. Refresh and try again.",
      );
  }
  const totals = new Map<Currency, AccountStatement["summaries"][number]>();
  for (const account of accounts) {
    const total = totals.get(account.currency) ?? {
      currency: account.currency,
      youOweMinor: 0,
      owedToYouMinor: 0,
      unknownAmounts: 0,
    };
    if (!account.excluded) {
      if (account.section === "owedToMe")
        total.owedToYouMinor = add(
          total.owedToYouMinor,
          account.remainingMinor,
        );
      else total.youOweMinor = add(total.youOweMinor, account.remainingMinor);
      total.unknownAmounts += account.unknownAmounts;
    }
    totals.set(account.currency, total);
  }
  return {
    contactId: input.contact.id,
    contactName: recordTitle(input.contact),
    contactEmail: text(input.contact.data, "email"),
    contactPhone: text(input.contact.data, "phone"),
    issuedBy: input.issuedBy,
    timezone: input.timezone,
    generatedAt: input.generatedAt,
    cached: input.cached,
    pendingActions: input.pendingActions ?? 0,
    assumedPayments: history.filter(
      (e) =>
        e.entryType === "payment" &&
        e.provenance === "assumedAutomatic" &&
        !e.confirmationReference &&
        !e.reversed,
    ).length,
    accounts,
    history,
    summaries: [...totals.values()].sort((a, b) =>
      a.currency.localeCompare(b.currency),
    ),
  };
}

export function statementTimestamp(value: string, timezone: string): string {
  return value
    ? new Intl.DateTimeFormat("en-PH", {
        timeZone: timezone,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not recorded";
}
