import { civilDate } from "../../core/domain/date";
import { currencies, moneyInput, parseMoney } from "../../core/domain/money";

export interface ReceiptDraft {
  amount?: string;
  paymentDate?: string;
  reference?: string;
}
export interface ReceiptScanResult {
  draft: ReceiptDraft;
  candidates: { amount: string[]; paymentDate: string[]; reference: string[] };
  warnings: string[];
}

const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const currencyPattern =
  /\b(?:PHP|USD|EUR|SGD|AUD|JPY|GBP|AED|CAD|CHF|CNY|HKD|IDR|INR|KRW|MYR|NZD|SAR|THB|TWD|VND)\b|[₱€£¥₹₩฿₫]/gi;
const currencySymbols: Record<string, string> = {
  "₱": "PHP",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
  "₩": "KRW",
  "฿": "THB",
  "₫": "VND",
};

/** OCR suggestions are untrusted drafts; ambiguous fields deliberately stay empty. */
export function parseReceiptText(
  input: string,
  code: string,
): ReceiptScanResult {
  if (!currencies.includes(code as (typeof currencies)[number]))
    throw new Error("Choose a supported currency.");
  const lines = input
    .slice(0, 50000)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const warnings: string[] = [];
  const foundCurrencies = [...input.matchAll(currencyPattern)].map(
    ([value]) => currencySymbols[value] ?? value.toUpperCase(),
  );
  const mismatch =
    foundCurrencies.some((value) => value !== code) ||
    (input.includes("$") && !["USD", "SGD", "AUD"].includes(code));
  if (mismatch)
    warnings.push(
      `Receipt currency differs from ${code}. Enter the payment amount yourself; no conversion was applied.`,
    );
  const amounts: { value: string; rank: number }[] = [];
  const dates = new Set<string>(),
    references = new Set<string>();
  function date(year: string, month: string | number, day: string) {
    try {
      dates.add(
        civilDate(
          `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`,
        ),
      );
    } catch {
      /* Invalid OCR dates are omitted. */
    }
  }
  lines.forEach((line, index) => {
    const reference = line.match(
      /\b(?:ref(?:erence)?\.?\s*(?:(?:no\.?|number|id)\s*)?|transaction\s*(?:no\.?|number|id))\s*[:#.-]?\s*(.*)$/i,
    );
    if (reference) {
      const value = (reference[1] || lines[index + 1] || "").trim();
      if (/^[A-Za-z0-9][A-Za-z0-9 -]{3,99}$/.test(value) && /\d/.test(value))
        references.add(value);
    }
    if (
      !/\b(?:due|expiry|expires|account|reference|ref\.?|transaction\s*(?:id|no|number))\b/i.test(
        line,
      )
    ) {
      for (const match of line.matchAll(
        /\b(20\d{2}|19\d{2}|21\d{2})-(\d{2})-(\d{2})\b/g,
      ))
        date(match[1], match[2], match[3]);
      for (const match of line.matchAll(
        /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g,
      )) {
        date(match[3], match[2], match[1]);
        if (Number(match[1]) <= 12) date(match[3], match[1], match[2]);
      }
      for (const match of line.matchAll(
        /\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/g,
      )) {
        const month = months.indexOf(match[1].toLowerCase().slice(0, 3));
        if (month >= 0) date(match[3], month + 1, match[2]);
      }
      for (const match of line.matchAll(
        /\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/g,
      )) {
        const month = months.indexOf(match[2].toLowerCase().slice(0, 3));
        if (month >= 0) date(match[3], month + 1, match[1]);
      }
    }
    if (
      mismatch ||
      /\b(?:subtotal|fee|fees|balance|change|due|account|reference|ref\.?|transaction\s*(?:id|no|number)|date)\b/i.test(
        line,
      )
    )
      return;
    const rank =
      /\b(?:total|amount\s+(?:paid|sent|transferred)|payment\s+amount)\b/i.test(
        line,
      )
        ? 3
        : /\bamount\b/i.test(line)
          ? 2
          : /\b(?:PHP|USD|EUR|SGD|AUD|JPY|GBP)\b|[₱€£¥$]/i.test(line)
            ? 1
            : 0;
    if (!rank) return;
    const source = /\d/.test(line) ? line : lines[index + 1] || "";
    if (/-\s*\d/.test(source)) return;
    for (const match of source.matchAll(
      /(?<![\d.,])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?![\d.,])/g,
    )) {
      try {
        amounts.push({
          value: moneyInput(parseMoney(match[0].replace(/,/g, ""), code), code),
          rank,
        });
      } catch {
        /* Invalid precision and unsafe amounts are omitted. */
      }
    }
  });
  const bestRank = Math.max(0, ...amounts.map((item) => item.rank));
  const candidates = {
    amount: [
      ...new Set(
        amounts
          .filter((item) => item.rank === bestRank)
          .map((item) => item.value),
      ),
    ],
    paymentDate: [...dates],
    reference: [...references],
  };
  const draft: ReceiptDraft = {};
  for (const field of ["amount", "paymentDate", "reference"] as const) {
    if (candidates[field].length === 1) draft[field] = candidates[field][0];
    if (candidates[field].length > 1)
      warnings.push(
        `Several ${field === "paymentDate" ? "dates" : field === "amount" ? "amounts" : "references"} found. Choose or enter the correct value.`,
      );
  }
  if (!Object.values(candidates).some((values) => values.length))
    warnings.push(
      "No payment details found. Try a clearer image or enter the details manually.",
    );
  return { draft, candidates, warnings };
}

export function appendReceiptReference(notes: string, reference = ""): string {
  const value = reference.trim();
  if (value.length > 100 || /[\r\n\x00-\x1f]/.test(value))
    throw new Error("Use a reference of up to 100 characters on one line.");
  const line = `Reference: ${value}`;
  const result =
    !value || notes.split("\n").includes(line)
      ? notes
      : [notes, line].filter(Boolean).join("\n");
  if (result.length > 4000)
    throw new Error(
      "Payment notes and reference must fit within 4,000 characters.",
    );
  return result;
}
