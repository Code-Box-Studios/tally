import { displayDate } from "../../core/domain/date";
import { formatStatementMoney } from "./statement-money";
import { label } from "../../core/domain/records";
import {
  statementHistoryLabel,
  statementTimestamp,
  type AccountStatement,
} from "./statement";

function escape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

/** Creates a standalone printable document; every user supplied string is escaped. */
export function statementHtml(statement: AccountStatement): string {
  const h = escape;
  const money = (value: number | null, code: string) =>
    h(value === null ? "Amount needed" : formatStatementMoney(value, code));
  const date = (value: string) => h(value ? displayDate(value) : "—");
  const timestamp = (value: string) =>
    h(statementTimestamp(value, statement.timezone));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Statement of account — ${h(statement.contactName)}</title>
<style>
@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:12px/1.5 Arial,sans-serif;color:#172c27;margin:0;background:#fff}h1{font-size:28px;margin:8px 0}h2{font-size:18px;margin:24px 0 8px}h3{font-size:14px;margin:18px 0 6px}p{margin:5px 0}.brand{font-weight:700;font-size:17px;color:#246454}.muted,small{color:#596b65}.notice{background:#f1f5f2;border:1px solid #dce5df;padding:12px;margin:14px 0}.warning{background:#fff3dc;border-color:#e5d19c}table{width:100%;border-collapse:collapse;margin:8px 0 14px;table-layout:fixed}thead{display:table-header-group}th,td{text-align:left;padding:8px;vertical-align:top;border-bottom:1px solid #dce5df;overflow-wrap:anywhere}th{background:#f1f5f2;font-weight:600}td.money,th.money{text-align:right}.summary td{font-size:16px}.reference{font-size:10px;color:#596b65}tr{break-inside:avoid}h2,h3{break-after:avoid}.history td:nth-child(1){width:19%}.history td:nth-child(2){width:27%}.history td:nth-child(3){width:38%}.history td:nth-child(4){width:16%}footer{margin-top:28px;border-top:1px solid #dce5df;padding-top:10px;color:#596b65}@media screen{body{max-width:1000px;margin:32px auto;padding:24px}}@media print{.notice{print-color-adjust:exact}body{margin:0}}
</style></head><body>
<div class="brand">Tally</div><h1>Statement of account</h1>
<p><strong>${h(statement.contactName)}</strong></p><p class="muted">${[statement.contactEmail, statement.contactPhone].filter(Boolean).map(h).join(" · ")}</p>
<p>Prepared by ${h(statement.issuedBy || "Your Tally account")}</p><p>Generated ${timestamp(statement.generatedAt)} · ${h(statement.timezone)} <span class="reference">(${h(statement.generatedAt)})</span></p>
<div class="notice${statement.cached ? " warning" : ""}">${statement.cached ? "<strong>Cached data — reconnect to confirm current records.</strong>" : "Current records loaded for this statement."}
<p>Current balances and schedules at generation. Balances are not a historical as-of calculation. Recurring history stays with each billing period’s original contact.</p>
<p>${h(statementHistoryLabel(statement.historyRange))}. This date scope applies to payment activity only.</p>
<p>Each currency and each debt direction stays separate. Cancelled and archived obligations and skipped or cancelled periods are excluded from payable totals. Recurring totals cover generated billing periods only.</p>
${statement.assumedPayments ? `<p>${statement.assumedPayments} automatic payment(s) remain unconfirmed / assumed. Totals reflect the recorded ledger.</p>` : ""}
${statement.pendingActions ? `<p>${statement.pendingActions} saved action(s) await confirmation and are excluded from this statement.</p>` : ""}</div>
<h2>Current balances</h2>
${statement.summaries.length ? `<table class="summary"><thead><tr><th>Currency</th><th class="money">You owe ${h(statement.contactName)}</th><th class="money">${h(statement.contactName)} owes you</th></tr></thead><tbody>${statement.summaries.map((s) => `<tr><td>${h(s.currency)}${s.unknownAmounts ? `<p class="reference">${s.unknownAmounts} bill amount(s) needed; totals include known amounts only.</p>` : ""}</td><td class="money">${money(s.youOweMinor, s.currency)}</td><td class="money">${money(s.owedToYouMinor, s.currency)}</td></tr>`).join("")}</tbody></table>` : "<p>No obligations linked to this contact.</p>"}
<h2>Obligations and billing periods</h2>
${statement.accounts
  .map(
    (
      account,
    ) => `<h3>${h(account.title)} · ${h(account.currency)}</h3><p>${h(label(account.section))} · ${h(account.status)}${account.excluded ? " · Informational; excluded from payable totals" : ""}</p><p class="reference">Obligation ${h(account.id)}</p>${account.principalMinor !== null ? `<p>Principal ${money(account.principalMinor, account.currency)} · Interest amount ${money(account.interestMinor, account.currency)}</p>` : ""}${account.interestPolicy ? `<p class="muted">${h(account.interestPolicy)}</p>` : ""}
<table><thead><tr><th>Due date</th><th class="money">${account.section === "monthlyDues" ? "Generated amount" : "Original amount"}</th><th class="money">Recorded paid</th><th class="money">${account.excluded ? "Recorded balance" : "Remaining"}</th></tr></thead><tbody><tr><td>${date(account.dueDate)}</td><td class="money">${money(account.originalMinor, account.currency)}</td><td class="money">${money(account.paidMinor, account.currency)}</td><td class="money">${money(account.remainingMinor, account.currency)}${account.unknownAmounts ? '<p class="reference">Known amounts only</p>' : ""}</td></tr></tbody></table>
${account.section === "monthlyDues" && !account.periods.length ? '<p class="muted">No billing periods generated yet.</p>' : ""}
${account.installment ? "<h3>Installment schedule</h3>" : ""}
${account.installment && !account.periods.length ? '<p class="muted">Installment schedule unavailable in these records.</p>' : ""}
${account.periods.length ? `<table><thead><tr><th>Billing period / due date</th><th class="money">Amount</th><th class="money">Paid</th><th class="money">Remaining</th></tr></thead><tbody>${account.periods.map((period) => `<tr><td>${h(period.title)}<br>${date(period.dueDate)}<p class="reference">${h(period.status)}${period.excluded ? " · Excluded from payable totals" : ""}<br>${h(period.id)}</p></td><td class="money">${money(period.originalMinor, account.currency)}</td><td class="money">${money(period.paidMinor, account.currency)}</td><td class="money">${money(period.remainingMinor, account.currency)}</td></tr>`).join("")}</tbody></table>` : ""}`,
  )
  .join("")}
<h2>${statement.historyRange.from || statement.historyRange.to ? "Selected payment activity" : "All recorded payments and reversals"}</h2><p>${h(statementHistoryLabel(statement.historyRange))}</p><p class="muted">Activity uses payment dates, including corrections recorded later. Recorded dates show when entries were saved. Net activity subtracts reversals; it does not represent the current outstanding balance.</p>
${statement.activitySummaries.length ? `<table><thead><tr><th>Currency</th><th class="money">Net paid to contact</th><th class="money">Net received from contact</th></tr></thead><tbody>${statement.activitySummaries.map((activity) => `<tr><td>${h(activity.currency)}</td><td class="money">${money(activity.paidToContactMinor, activity.currency)}</td><td class="money">${money(activity.receivedFromContactMinor, activity.currency)}</td></tr>`).join("")}</tbody></table>` : ""}
${statement.history.length ? `<table class="history"><thead><tr><th>Dates</th><th>Obligation / entry</th><th>Details</th><th class="money">Amount</th></tr></thead><tbody>${statement.history.map((entry) => `<tr><td>Payment: ${date(entry.paymentDate)}<p class="reference">Recorded: ${timestamp(entry.recordedAt)}</p></td><td>${h(entry.title)}<br>${entry.entryType === "reversal" ? "Reversal" : entry.reversed ? "Payment · reversed" : "Payment"}<p class="reference">${h(entry.id)}${entry.reversesPaymentId ? `<br>Reverses ${h(entry.reversesPaymentId)}` : ""}</p></td><td>${entry.direction === "owedToMe" ? "Received from contact" : "Paid to contact"}<br>${h([entry.method, entry.source].filter(Boolean).join(" · "))}<p>${h(entry.provenanceLabel)}</p>${entry.confirmationReference ? `<p class="reference">User confirmation ${h(entry.confirmationReference)}</p>` : ""}${entry.notes ? `<p>${h(entry.notes)}</p>` : ""}</td><td class="money">${money(entry.signedAmountMinor, entry.currency)}</td></tr>`).join("")}</tbody></table>` : "<p>No recorded payments or reversals.</p>"}
<footer>Prepared from your Tally records. Informational statement; independent obligations remain separate.<br>Contact reference: ${h(statement.contactId)}</footer></body></html>`;
}
