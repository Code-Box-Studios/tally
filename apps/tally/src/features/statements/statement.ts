import { civilDate, displayDate } from "../../core/domain/date";
import { currency, minor, type Currency } from "../../core/domain/money";
import { addStatementTotals } from "./statement-money";
import {
  hasComputedInterest,
  interestSummary,
} from "../obligations/interest-settings";
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
  installment: boolean;
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
  historyRange: { from: string | null; to: string | null };
  activitySummaries: {
    currency: Currency;
    paidToContactMinor: number;
    receivedFromContactMinor: number;
  }[];
}
export interface StatementHistoryRange {
  from?: string | null;
  to?: string | null;
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
  historyRange?: StatementHistoryRange;
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

function savedContact(row: Row, fallback: unknown): unknown {
  // An explicit null is an unassigned record, not a missing legacy snapshot.
  return Object.hasOwn(row.data, "contactId") ? row.data.contactId : fallback;
}

/** Produces a current snapshot from complete, owner-verified repository collections. */
export function buildStatement(input: StatementInput): AccountStatement {
  if (!Number.isFinite(Date.parse(input.generatedAt)))
    throw new Error("Invalid statement generation date.");
  new Intl.DateTimeFormat("en", { timeZone: input.timezone });
  const allParents = unique(input.obligations);
  const allInstances = unique(input.instances);
  unique(input.payments);
  const evidence = input.evidence ?? [];
  unique(evidence);
  const instances = input.instances.filter((instance) => {
    const parent = allParents.get(text(instance.data, "obligationId"));
    return (
      parent &&
      savedContact(instance, parent.data.contactId) === input.contact.id
    );
  });
  const scoped = input.payments.filter((payment) => {
    const parent = allParents.get(text(payment.data, "obligationId"));
    if (!parent) return false;
    if (parent.data.section !== "monthlyDues")
      return parent.data.contactId === input.contact.id;
    const instance = allInstances.get(
      text(payment.data, "obligationInstanceId"),
    );
    const instanceContact = instance
      ? savedContact(instance, parent.data.contactId)
      : parent.data.contactId;
    const contactId = savedContact(payment, instanceContact);
    if (
      instance &&
      (contactId === input.contact.id ||
        instanceContact === input.contact.id) &&
      (instance.data.obligationId !== parent.id ||
        contactId !== instanceContact)
    )
      throw new Error(
        "A payment's contact differs from its billing period. Refresh before generating a statement.",
      );
    return contactId === input.contact.id;
  });
  const historicalParents = new Set(
    [...instances, ...scoped].map((r) => text(r.data, "obligationId")),
  );
  const parents = input.obligations.filter(
    (r) =>
      r.data.contactId === input.contact.id ||
      (r.data.section === "monthlyDues" && historicalParents.has(r.id)),
  );
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
      const installment = parent.data.type === "installment";
      const periods: StatementPeriod[] =
        recurring || installment
          ? (recurring ? instances : input.instances)
              .filter((r) => r.data.obligationId === parent.id)
              .map((period) => {
                if (
                  currency(
                    period.data.currency ?? (installment ? code : undefined),
                  ) !== code
                )
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
                    add(paidMinor, minor(remainingMinor, true)) !==
                      originalMinor
                  )
                    throw new Error("Billing period balance needs recovery.");
                }
                return {
                  id: period.id,
                  title: text(
                    period.data,
                    "periodLabel",
                    installment ? "Installment" : "Billing period",
                  ),
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
                  a.dueDate.localeCompare(b.dueDate) ||
                  a.id.localeCompare(b.id),
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
      if (installment) {
        const ids = parent.data.installmentInstanceIds;
        if (
          (Array.isArray(ids) &&
            (ids.length < 2 ||
              ids.length !== periods.length ||
              new Set(ids).size !== ids.length ||
              periods.some((p) => !ids.includes(p.id)))) ||
          (periods.length > 0 &&
            (periods.some((p) => p.originalMinor === null) ||
              periods.reduce((sum, p) => add(sum, p.originalMinor ?? 0), 0) !==
                originalMinor ||
              periods.reduce((sum, p) => add(sum, p.paidMinor), 0) !==
                paidMinor ||
              periods.reduce((sum, p) => add(sum, p.remainingMinor ?? 0), 0) !==
                remainingMinor))
        )
          throw new Error(
            "The installment schedule does not match its current balance. Refresh and try again.",
          );
      }
      let principalMinor: number | null = null,
        interestMinor: number | null = null,
        interestPolicy = "";
      if (parent.data.interestInfo) {
        const info = object(parent.data.interestInfo);
        if (hasComputedInterest(info)) {
          principalMinor = minor(info.principalMinor);
          interestMinor = minor(info.interestMinor, true);
          if (
            add(principalMinor, interestMinor) !== originalMinor ||
            info.totalMinor !== originalMinor
          )
            throw new Error(
              "Interest breakdown does not match the recorded obligation.",
            );
          interestPolicy = interestSummary(info, code);
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
        installment,
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
      original.data.amountMinor !== entry.data.amountMinor ||
      original.data.paymentDate !== entry.data.paymentDate
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
  return selectStatementHistory(
    {
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
      historyRange: { from: null, to: null },
      activitySummaries: [],
      summaries: [...totals.values()].sort((a, b) =>
        a.currency.localeCompare(b.currency),
      ),
    },
    input.historyRange,
  );
}

/** Filters a complete statement's payment activity without changing its current balances. */
export function selectStatementHistory(
  statement: AccountStatement,
  range: StatementHistoryRange = {},
): AccountStatement {
  const from = range.from ? civilDate(range.from) : null;
  const to = range.to ? civilDate(range.to) : null;
  if (from && to && from > to)
    throw new Error("From date must be on or before To date.");
  const history = statement.history.filter(
    (entry) =>
      (!from || entry.paymentDate >= from) && (!to || entry.paymentDate <= to),
  );
  const totals = new Map<Currency, { paid: bigint; received: bigint }>();
  for (const entry of history) {
    const total = totals.get(entry.currency) ?? { paid: 0n, received: 0n };
    if (entry.direction === "owedToMe")
      total.received += BigInt(entry.signedAmountMinor);
    else total.paid += BigInt(entry.signedAmountMinor);
    totals.set(entry.currency, total);
  }
  const exact = (value: bigint) => {
    if (
      value < -BigInt(Number.MAX_SAFE_INTEGER) ||
      value > BigInt(Number.MAX_SAFE_INTEGER)
    )
      throw new Error("Statement activity total exceeds the supported range.");
    return Number(value);
  };
  return {
    ...statement,
    history,
    historyRange: { from, to },
    activitySummaries: [...totals]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, total]) => ({
        currency: code,
        paidToContactMinor: exact(total.paid),
        receivedFromContactMinor: exact(total.received),
      })),
  };
}

export function statementHistoryLabel(
  range: AccountStatement["historyRange"],
): string {
  if (range.from && range.to)
    return `Payment dates: ${displayDate(range.from)} – ${displayDate(range.to)} (inclusive)`;
  if (range.from) return `Payment dates: ${displayDate(range.from)} onward`;
  if (range.to)
    return `Payment dates: through ${displayDate(range.to)} (inclusive)`;
  return "All recorded payments and reversals";
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
