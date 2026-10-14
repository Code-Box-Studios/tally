import { civilDate } from "../../core/domain/date";
import { currency, parseMoney } from "../../core/domain/money";
import { object, text, type Data, type Row } from "../../core/domain/records";
import {
  calculateInterest,
  generateInstallments,
  installmentDates,
  parseInterestRate,
  type InterestBasis,
  type InstallmentFrequency,
} from "../obligations/lending-calculations";
import { canonicalCommand } from "../sync/data/command-identity";
import type { Digest } from "../sync/data/receipt";
import type { SavedCommand } from "../sync/data/store";
import {
  fieldForHeading,
  normalizeHeading,
  type ColumnMapping,
  type CsvTable,
  type ImportField,
} from "./csv";

export type ImportCommand =
  "createObligation" | "createInstallment" | "createRecurring";
export interface ImportContext {
  owner: string;
  environment: string;
  currency: string;
  timezone: string;
  today: string;
  defaultKind: string;
  defaultCategoryId: string;
  categories: Row[];
  contacts: Row[];
  sources: Row[];
  existing: Row[];
  pending: SavedCommand[];
}
export interface ImportPreviewRow {
  sourceRow: number;
  title: string;
  command: ImportCommand | null;
  payload: Data | null;
  errors: string[];
  duplicate: "file" | "saved-action" | "existing-record" | null;
  selected: boolean;
  commandId: string | null;
}
const clean = (value: string) => value.trim().normalize("NFC");
const normalized = (value: string) => clean(value).toLocaleLowerCase("en");
function money(value: string, code: string) {
  const trimmed = value.trim();
  return parseMoney(
    /^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(trimmed)
      ? trimmed.replace(/,/g, "")
      : trimmed,
    code,
  );
}
function reference(
  value: string,
  rows: Row[],
  kind: "contact" | "category" | "source",
): string | null {
  if (!value) return null;
  const matches = rows.filter(
    (row) =>
      (kind === "contact"
        ? row.data.archived !== true
        : row.data.active === true) &&
      (row.id === value ||
        normalized(
          text(row.data, kind === "contact" ? "displayName" : "name"),
        ) === normalized(value)),
  );
  if (matches.length !== 1)
    throw new Error(
      `Match ${kind} “${value}” to one active record. Create or rename it before importing.`,
    );
  return matches[0].id;
}
function signature(command: string, payload: Data): string {
  const recurring = command === "createRecurring";
  const recurrence =
    recurring && payload.recurrence ? object(payload.recurrence) : {};
  return canonicalCommand({
    title: normalized(String(payload.title ?? "")),
    kind: recurring
      ? "recurring"
      : command === "createInstallment"
        ? "installment"
        : "finite",
    direction: recurring ? "owedByMe" : payload.direction,
    amount: recurring ? payload.defaultAmountMinor : payload.amountMinor,
    currency: payload.currency,
    contact: payload.contactId ?? null,
    date: recurring ? recurrence.startDate : payload.originationDate,
    due: recurring ? null : payload.dueDate,
    ...(recurring
      ? {
          frequency: recurrence.frequency,
          interval: recurrence.interval,
          unit: recurrence.unit,
          end: recurrence.endDate ?? null,
          amountKind: payload.amountKind,
        }
      : {}),
  });
}
function existingSignature(row: Row): string {
  const d = row.data;
  const command =
    d.type === "recurringDue" || d.section === "monthlyDues"
      ? "createRecurring"
      : d.type === "installment"
        ? "createInstallment"
        : "createObligation";
  return signature(command, {
    ...d,
    amountMinor: d.originalAmountMinor,
    dueDate: d.dueDate ?? null,
  });
}
function buildPayload(
  values: Partial<Record<ImportField, string>>,
  context: ImportContext,
): { command: ImportCommand; payload: Data } {
  const v = (key: ImportField) => clean(values[key] ?? "");
  const title = v("title");
  if (!title || title.length > 120)
    throw new Error("Enter a title of 1–120 characters.");
  const description = v("description"),
    notes = v("notes");
  if (description.length > 1000 || notes.length > 4000)
    throw new Error("Description allows 1,000 characters; notes allow 4,000.");
  const code = currency((v("currency") || context.currency).toUpperCase());
  if (!v("originationDate"))
    throw new Error("Map an explicit original / start date (YYYY-MM-DD).");
  const start = civilDate(v("originationDate"));
  const kind = normalizeHeading(v("kind") || context.defaultKind);
  if (
    ![
      "borrowed",
      "lent",
      "loan",
      "owedbyme",
      "owedtome",
      "installment",
      "recurring",
      "bill",
      "monthlydues",
    ].includes(kind)
  )
    throw new Error("Type must be borrowed, lent, installment or recurring.");
  const recurring = ["recurring", "bill", "monthlydues"].includes(kind);
  const installment = kind === "installment" || !!v("installmentCount");
  const directionValue = normalizeHeading(
    v("direction") ||
      (["lent", "owedtome"].includes(kind) ? "owedToMe" : "owedByMe"),
  );
  const direction = ["lent", "owedtome", "receivable"].includes(directionValue)
    ? "owedToMe"
    : ["borrowed", "owedbyme", "iowe", "payable"].includes(directionValue)
      ? "owedByMe"
      : null;
  if (!direction)
    throw new Error(
      "Direction must be borrowed / owedByMe or lent / owedToMe.",
    );
  if (
    v("kind") &&
    v("direction") &&
    ((["lent", "owedtome"].includes(kind) && direction !== "owedToMe") ||
      (["borrowed", "owedbyme"].includes(kind) && direction !== "owedByMe"))
  )
    throw new Error(
      "Loan type and direction disagree. Correct the CSV before importing.",
    );
  const categoryId = reference(
    v("category") || context.defaultCategoryId,
    context.categories,
    "category",
  );
  if (!categoryId)
    throw new Error("Choose a default category or map a category column.");
  const base = {
    title,
    description,
    notes,
    currency: code,
    categoryId,
    contactId: reference(v("contact"), context.contacts, "contact"),
    paymentSourceId: reference(v("source"), context.sources, "source"),
  };
  if (recurring) {
    if (
      direction !== "owedByMe" ||
      installment ||
      v("firstDueDate") ||
      v("installmentFrequency") ||
      v("interestRate") ||
      v("interestBasis") ||
      v("interestNotes") ||
      v("dueDate")
    )
      throw new Error(
        "Bills need a start date and frequency; loan, interest and installment terms cannot be imported as a bill.",
      );
    const frequency = v("frequency").toLowerCase();
    const standard: Record<string, [string, number]> = {
      weekly: ["weeks", 1],
      biweekly: ["weeks", 2],
      monthly: ["months", 1],
      quarterly: ["months", 3],
      yearly: ["years", 1],
    };
    if (!standard[frequency])
      throw new Error(
        "Bill frequency must be weekly, biweekly, monthly, quarterly or yearly.",
      );
    const [unit, interval] = standard[frequency];
    const endDate = v("endDate") ? civilDate(v("endDate")) : null;
    if (endDate && endDate < start)
      throw new Error("Bill end date must follow its start date.");
    const amountKind = v("amountKind") || "fixed";
    if (!["fixed", "variable"].includes(amountKind))
      throw new Error("Amount kind must be fixed or variable.");
    if (amountKind === "fixed" && !v("amount"))
      throw new Error("Enter the fixed bill amount.");
    return {
      command: "createRecurring",
      payload: {
        ...base,
        amountKind,
        defaultAmountMinor: v("amount") ? money(v("amount"), code) : null,
        paymentMode: "manual",
        recurrence: {
          frequency,
          unit,
          interval,
          anchorDate: start,
          startDate: start,
          endDate,
          preferredDay: ["months", "years"].includes(unit)
            ? Number(start.slice(8))
            : null,
          monthEnd: false,
          timezone: context.timezone,
          localDeductionTime: "09:00",
          ruleVersion: 1,
        },
        reminderPolicy: {
          enabled: true,
          offsetDays: [3, 0],
          localTime: "09:00",
        },
      },
    };
  }
  if (start > context.today)
    throw new Error("Borrowed or lent date cannot be in the future.");
  if (v("frequency") || v("endDate") || v("amountKind"))
    throw new Error("Bill terms require a recurring bill type.");
  let dueDate = v("dueDate") ? civilDate(v("dueDate")) : null;
  let count = 0,
    firstDue = "",
    installmentFrequency: InstallmentFrequency = "monthly";
  if (installment) {
    if (!/^\d+$/.test(v("installmentCount")))
      throw new Error("Enter a whole installment count from 2 to 120.");
    count = Number(v("installmentCount"));
    firstDue = civilDate(v("firstDueDate"));
    installmentFrequency = v("installmentFrequency") as InstallmentFrequency;
    if (!["weekly", "biweekly", "monthly"].includes(installmentFrequency))
      throw new Error(
        "Installment frequency must be weekly, biweekly or monthly.",
      );
    const dates = installmentDates(count, firstDue, installmentFrequency);
    if (firstDue < start)
      throw new Error("First installment date must follow the original date.");
    const last = dates[dates.length - 1];
    if (dueDate && dueDate !== last)
      throw new Error("Due date must match the final installment.");
    dueDate = last;
  } else if (v("firstDueDate") || v("installmentFrequency"))
    throw new Error("Installment terms need an installment count.");
  if (dueDate && dueDate < start)
    throw new Error("Due date must follow the original date.");
  const principal = money(v("amount"), code);
  let interestInfo: Data | null = null;
  if (v("interestRate")) {
    const basisValue = normalizeHeading(v("interestBasis"));
    const basis = (
      {
        onetime: "oneTime",
        monthly: "monthly",
        annual: "annual",
        yearly: "annual",
      } as Record<string, InterestBasis>
    )[basisValue];
    if (!basis)
      throw new Error(
        "Interest needs an explicit basis: oneTime, monthly or annual.",
      );
    if (v("interestNotes").length > 2000)
      throw new Error("Interest agreement notes allow 2,000 characters.");
    interestInfo = {
      ...calculateInterest(
        principal,
        parseInterestRate(v("interestRate")),
        basis,
        start,
        dueDate,
      ),
      agreementNotes: v("interestNotes"),
    };
  } else if (v("interestBasis") || v("interestNotes"))
    throw new Error("Interest terms need an interest rate.");
  const total = interestInfo ? Number(interestInfo.totalMinor) : principal;
  return {
    command: installment ? "createInstallment" : "createObligation",
    payload: {
      ...base,
      direction,
      amountMinor: total,
      originationDate: start,
      dueDate,
      interestInfo,
      ...(installment
        ? {
            installments: generateInstallments(
              total,
              count,
              firstDue,
              installmentFrequency,
            ),
          }
        : {}),
    },
  };
}

export async function buildImportPreview(
  table: CsvTable,
  mapping: ColumnMapping,
  context: ImportContext,
  digest: Digest,
): Promise<ImportPreviewRow[]> {
  if (mapping.length !== table.headers.length)
    throw new Error("Match every CSV column.");
  const fields = mapping.filter(Boolean);
  if (new Set(fields).size !== fields.length)
    throw new Error("Match each Tally field to only one CSV column.");
  const existing = new Set(context.existing.map(existingSignature));
  const pending = context.pending.filter(
    (item) =>
      item.owner === context.owner &&
      item.environment === context.environment &&
      item.status !== "discarded",
  );
  const queued = new Set(
    pending.map((item) => signature(item.name, item.payload)),
  );
  const seen = new Set<string>();
  const seenCommands = new Set<string>();
  const result: ImportPreviewRow[] = [];
  for (let index = 0; index < table.rows.length; index++) {
    const cells = table.rows[index],
      values: Partial<Record<ImportField, string>> = {},
      errors: string[] = [];
    cells.forEach((value, column) => {
      const field = mapping[column];
      if (field) values[field] = value;
      if (!value.trim()) return;
      const heading = normalizeHeading(table.headers[column]);
      const recognized = fieldForHeading(table.headers[column]);
      const financial =
        /status|lifecycle|closed|settled|cancelled|canceled|isactive|interest|apr|rate|principal|installment|payment|paid|balance|remaining|outstanding|compound|fee|charge|deduct|schedule|recurr|frequency|term|due|currency|amount|lent|borrow|direction|origination|startdate|enddate/.test(
          heading,
        );
      const supportedMetadata =
        ["contact", "source", "interestNotes"].includes(field || "") &&
        recognized === field;
      if (
        financial &&
        !supportedMetadata &&
        (!field ||
          [
            "notes",
            "description",
            "title",
            "contact",
            "category",
            "source",
            "interestNotes",
          ].includes(field) ||
          (!recognized &&
            /status|lifecycle|closed|settled|cancelled|canceled|isactive|paid|payment|balance|remaining|outstanding|compound|fee|charge|schedule|deduct|apr/.test(
              heading,
            )))
      )
        errors.push(
          `Column “${table.headers[column]}” contains financial terms that are not supported or matched. Correct the CSV before importing this row.`,
        );
    });
    const row: ImportPreviewRow = {
      sourceRow: index + 2,
      title: values.title?.trim() || `Row ${index + 2}`,
      command: null,
      payload: null,
      commandId: null,
      errors,
      duplicate: null,
      selected: false,
    };
    try {
      if (!errors.length) {
        const { command, payload } = buildPayload(values, context);
        const key = signature(command, payload);
        const commandId =
          "import-v1-" +
          (await digest(
            canonicalCommand({
              owner: context.owner,
              environment: context.environment,
              command,
              payload,
            }),
          ));
        const duplicate = seenCommands.has(commandId)
          ? "file"
          : pending.some((item) => item.id === commandId) ||
              queued.has(signature(command, payload))
            ? "saved-action"
            : seen.has(key) || existing.has(signature(command, payload))
              ? "existing-record"
              : null;
        seen.add(key);
        seenCommands.add(commandId);
        Object.assign(row, {
          command,
          payload,
          commandId,
          duplicate,
          selected: !duplicate,
        });
      }
    } catch (error) {
      row.errors.push((error as Error).message);
    }
    result.push(row);
  }
  return result;
}
