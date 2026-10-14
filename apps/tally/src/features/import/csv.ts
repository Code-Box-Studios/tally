export const importFields = {
  title: "Title",
  kind: "Type",
  direction: "Direction",
  amount: "Amount / principal",
  currency: "Currency",
  originationDate: "Original / start date",
  dueDate: "Due date",
  contact: "Person or company",
  category: "Category",
  source: "Payment source",
  description: "Description",
  notes: "Notes",
  frequency: "Bill frequency",
  endDate: "Bill end date",
  amountKind: "Fixed or variable",
  installmentCount: "Installment count",
  firstDueDate: "First installment date",
  installmentFrequency: "Installment frequency",
  interestRate: "Interest rate (%)",
  interestBasis: "Interest basis",
  interestNotes: "Interest agreement notes",
} as const;
export type ImportField = keyof typeof importFields;
export type ColumnMapping = (ImportField | "")[];
export interface CsvTable {
  headers: string[];
  rows: string[][];
}
export const normalizeHeading = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");
const aliases: Record<ImportField, string[]> = {
  title: ["title", "loantitle", "billtitle", "name"],
  kind: ["type", "kind", "loantype"],
  direction: ["direction", "owedby", "owedto"],
  amount: ["amount", "principal", "originalamount", "principalamount"],
  currency: ["currency", "currencycode"],
  originationDate: [
    "date",
    "originationdate",
    "originaldate",
    "startdate",
    "borroweddate",
    "lentdate",
  ],
  dueDate: ["duedate", "finalduedate"],
  contact: [
    "person",
    "contact",
    "contactid",
    "borrower",
    "lender",
    "company",
    "personorcompany",
  ],
  category: ["category", "categoryid"],
  source: ["paymentsource", "paymentsourceid"],
  description: ["description"],
  notes: ["notes", "note"],
  frequency: ["frequency", "billfrequency", "recurrence"],
  endDate: ["enddate", "billenddate"],
  amountKind: ["amountkind", "fixedorvariable"],
  installmentCount: ["installmentcount", "numberofinstallments"],
  firstDueDate: ["firstduedate", "firstinstallmentdate"],
  installmentFrequency: ["installmentfrequency"],
  interestRate: ["interestrate", "interestratepercent"],
  interestBasis: ["interestbasis"],
  interestNotes: ["interestnotes", "agreementnotes", "interestagreementnotes"],
};
export function fieldForHeading(header: string): ImportField | "" {
  return (
    (Object.keys(aliases) as ImportField[]).find((key) =>
      aliases[key].includes(normalizeHeading(header)),
    ) ?? ""
  );
}
export function suggestMapping(headers: string[]): ColumnMapping {
  const candidates = headers.map(fieldForHeading);
  return candidates.map((field) =>
    field && candidates.filter((candidate) => candidate === field).length === 1
      ? field
      : "",
  );
}
/** Parse bounded comma-separated text without losing quotes or multiline cells. */
export function parseCsv(input: string): CsvTable {
  if (input.length > 2 * 1024 * 1024)
    throw new Error("Choose a CSV smaller than 2 MiB.");
  const text = input.replace(/^\ufeff/, "");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const finishCell = () => {
    row.push(cell);
    cell = "";
    closed = false;
    if (row.length > 64) throw new Error("Use at most 64 columns.");
  };
  const finishRow = () => {
    finishCell();
    if (row.some((value) => value.trim())) rows.push(row);
    row = [];
    if (rows.length > 501)
      throw new Error("Import at most 500 rows at a time.");
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted) {
        quoted = false;
        closed = true;
      } else if (!cell && !closed) quoted = true;
      else throw new Error("Check CSV quotation marks.");
    } else if (quoted) cell += char;
    else if (char === ",") finishCell();
    else if (char === "\n" || char === "\r") {
      finishRow();
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else {
      if (closed)
        throw new Error(
          "Only a comma or line break may follow a closing quote.",
        );
      cell += char;
    }
    if (cell.length > 20000)
      throw new Error("A CSV cell is too long (20,000 characters maximum).");
  }
  if (quoted) throw new Error("Close every quoted CSV cell.");
  if (cell || row.length || closed) finishRow();
  if (rows.length < 2)
    throw new Error("Include a header row and at least one data row.");
  const headers = rows.shift()!.map((value) => value.trim());
  if (headers.some((value) => !value))
    throw new Error("Give every column a header.");
  if (rows.some((values) => values.length !== headers.length))
    throw new Error(
      "Every row must have the same number of columns as the header.",
    );
  return { headers, rows };
}
