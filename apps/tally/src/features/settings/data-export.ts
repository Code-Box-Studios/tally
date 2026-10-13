import type { TallyRepository } from "../../core/backend/repository";
import {
  decodeRow,
  type Collection,
  type Profile,
  type Row,
  text,
} from "../../core/domain/records";
import { moneyInput } from "../../core/domain/money";

export const exportCollections: Collection[] = [
  "obligations",
  "obligationInstances",
  "contacts",
  "payments",
  "paymentSources",
  "categories",
  "activities",
  "summaries",
  "ledgerState",
  "deductionAttempts",
  "paymentEvidence",
  "reminders",
  "notificationPreferences",
  "attachments",
];
export type RecordExport = {
  format: "tally-records";
  version: 1;
  generatedAt: string;
  profile: Profile;
  records: Partial<Record<Collection, Row[]>>;
};

export async function collectExport(
  repo: TallyRepository,
  profile: Profile,
): Promise<RecordExport> {
  repo.check();
  if (profile.userId !== repo.owner)
    throw new Error("Your sign-in changed. Reopen Settings before exporting.");
  const fetched = await Promise.all(
    exportCollections.map(async (collection) => {
      const result = await repo.records(collection);
      repo.check();
      if (result.cached)
        throw new Error(
          "Reconnect before exporting so every collection is up to date.",
        );
      return [
        collection,
        result.rows.map((row) => decodeRow(row, repo.owner)),
      ] as const;
    }),
  );
  repo.check();
  return {
    format: "tally-records",
    version: 1,
    generatedAt: new Date().toISOString(),
    profile: { ...profile },
    records: Object.fromEntries(fetched),
  };
}

function csvCell(value: string | number | null) {
  let raw = value === null ? "" : String(value);
  // Spreadsheet programs must never interpret a person's text as a formula.
  if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+@-]/.test(raw))
    raw = "'" + raw;
  return `"${raw.replaceAll('"', '""')}"`;
}

export function paymentsCsv(exported: RecordExport) {
  const parents = new Map(
    (exported.records.obligations ?? []).map((row) => [row.id, row]),
  );
  const contacts = new Map(
    (exported.records.contacts ?? []).map((row) => [row.id, row]),
  );
  const periods = new Map(
    (exported.records.obligationInstances ?? []).map((row) => [row.id, row]),
  );
  const header = [
    "Payment date",
    "Entry type",
    "Obligation",
    "Contact",
    "Direction",
    "Currency",
    "Amount",
    "Signed amount (reversals negative)",
    "Amount (minor units)",
    "Payment source",
    "Notes",
    "Payment ID",
    "Obligation ID",
    "Period ID",
    "Reverses payment ID",
  ];
  const rows = (exported.records.payments ?? []).map((row) => {
    const d = row.data,
      parent = parents.get(text(d, "obligationId"));
    const period = periods.get(text(d, "obligationInstanceId"));
    // Historical snapshots take precedence over the obligation's current contact.
    const contactId = Object.hasOwn(d, "contactId")
      ? text(d, "contactId")
      : period && Object.hasOwn(period.data, "contactId")
        ? text(period.data, "contactId")
        : text(parent?.data ?? {}, "contactId");
    const source =
      d.sourceSnapshot &&
      typeof d.sourceSnapshot === "object" &&
      !Array.isArray(d.sourceSnapshot)
        ? text(d.sourceSnapshot, "name")
        : "";
    const amount =
      typeof d.amountMinor === "number"
        ? Number(moneyInput(d.amountMinor, text(d, "currency")))
        : null;
    return [
      text(d, "paymentDate"),
      text(d, "entryType"),
      text(parent?.data ?? {}, "title"),
      text(contacts.get(contactId)?.data ?? {}, "displayName"),
      text(d, "direction", text(parent?.data ?? {}, "direction")),
      text(d, "currency"),
      amount,
      amount === null ? null : amount * (d.entryType === "reversal" ? -1 : 1),
      typeof d.amountMinor === "number" ? d.amountMinor : null,
      source,
      text(d, "notes"),
      row.id,
      text(d, "obligationId"),
      text(d, "obligationInstanceId"),
      text(d, "reversesPaymentId"),
    ];
  });
  // A BOM helps spreadsheet apps recognize UTF-8 names and currency symbols.
  return (
    "\uFEFF" +
    [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
