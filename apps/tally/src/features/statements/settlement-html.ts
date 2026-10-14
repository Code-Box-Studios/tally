import { displayDate } from "../../core/domain/date";
import { formatMoney } from "../../core/domain/money";
import { statementTimestamp } from "./statement";
import type { Settlement } from "./settlement";
const h = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

export function settlementHtml(s: Settlement): string {
  const money = (minor: number) => h(formatMoney(minor, s.currency));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tally — Paid-in-full confirmation</title><style>
  @page{size:A4;margin:18mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#20382e;background:#fff;line-height:1.5;margin:0;padding:24px;font-size:14px}.document{max-width:720px;margin:auto}.brand{font-size:28px;font-weight:700;letter-spacing:-1px}.brand svg{vertical-align:middle;margin-right:8px}.kicker{color:#416f58;font-weight:700;text-transform:uppercase;letter-spacing:2px;font-size:11px;margin-top:36px}h1{font-size:30px;line-height:1.2;margin:10px 0}h2{font-size:20px;margin:8px 0 24px;overflow-wrap:anywhere}.muted,dt{color:#617267}dl{margin:0}dt{font-size:12px}dd{margin:4px 0 0;font-weight:700;overflow-wrap:anywhere}.parties{display:flex;gap:32px;border-top:1px solid #dbe3dd;padding-top:20px}.parties dl{flex:1;min-width:0}.summary{background:#eef5ef;border:1px solid #cbded0;border-radius:12px;padding:22px;margin:24px 0}.balance{font-size:32px;font-weight:700;margin:4px 0 0}table{width:100%;border-collapse:collapse}td{padding:10px 0;border-bottom:1px solid #e1e8e3;vertical-align:top}td:last-child{text-align:right;font-weight:700}.foot{margin-top:30px;font-size:11px;color:#617267;overflow-wrap:anywhere}@media print{body{padding:0}.summary,.parties{break-inside:avoid}}@media(max-width:420px){body{padding:16px}.parties{flex-direction:column;gap:16px}h1{font-size:26px}}
  </style></head><body><main class="document"><div class="brand"><svg width="30" height="30" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#d4e8d8"/><path d="M10 8v17M16 7v17M22 6v17M6 20l21-9" stroke="#315b44" stroke-width="2"/></svg>tally.</div>
  <p class="kicker">Paid in full</p><h1>Paid-in-full confirmation</h1><h2>${h(s.title)}</h2>
  <div class="parties"><dl><dt>Lender</dt><dd>${h(s.lender)}</dd></dl><dl><dt>Borrower</dt><dd>${h(s.borrower)}</dd></dl></div>
  <section class="summary"><div>Remaining balance · ${h(s.currency)}</div><div class="balance">${money(0)}</div><div>Settled on ${h(displayDate(s.settlementDate))}</div></section>
  <p>Tally records show that the recorded total for this loan has been paid in full.</p>
  <table aria-label="Settlement totals"><tbody>${s.principalMinor !== null && s.interestMinor !== null ? `<tr><td>Principal</td><td>${money(s.principalMinor)}</td></tr><tr><td>Recorded interest / charges</td><td>${money(s.interestMinor)}</td></tr>` : ""}<tr><td>Recorded loan total</td><td>${money(s.originalMinor)}</td></tr><tr><td>Net payments received</td><td>${money(s.paidMinor)}</td></tr><tr><td>Remaining balance</td><td>${money(0)}</td></tr><tr><td>Confirmed payments</td><td>${s.paymentCount}</td></tr></tbody></table>
  <div class="foot"><p>Prepared by ${h(s.issuedBy)} using Tally.<br>Loan reference: ${h(s.obligationId)}<br>Generated ${h(statementTimestamp(s.generatedAt, s.timezone))} (${h(s.timezone)})</p><p>This confirmation reflects recorded payments as of generation. Reversed payments are excluded. Later corrections may change these records. It is not a bank-issued receipt or a signed release.</p></div>
  </main></body></html>`;
}
