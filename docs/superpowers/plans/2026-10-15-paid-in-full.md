# Paid-in-full Confirmation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline.

**Goal:** Export a shareable paid-in-full PDF from a settled loan.

**Architecture:** An authenticated, read-only endpoint returns a coherent owner snapshot, guarded by the existing profile version. A pure confirmation model reuses statement accounting validation. A loan-detail panel previews the result and refreshes it for each export through shared web/native PDF helpers.

**Tech Stack:** Expo SDK 57, React Native, TypeScript, Supabase Edge Functions, Vitest, Jest, Deno tests.

**Spec:** User selected suggestion 7: paid-in-full confirmation with amount paid, settlement date, and zero balance. Support both directions, installments, and saved interest; exclude recurring bills and cancelled loans. Use saved party names, or explicitly indicate missing names. Export is a dated record snapshot, with no invented signature or legal certification. Do not include private notes, payment-source details, or contact details.

## Global Constraints

- Work directly on main; preserve unrelated Flutter changes.
- No database migration or new libraries; align existing Expo dependencies when required by compatibility checks.
- Export must obtain fresh online records and reject pending local actions.
- Open the web print window during the tap, before asynchronous checks; clean native temporary PDFs.
- Verify the active owner around asynchronous work.

## Review Focus

- Reversal followed by repayment: settlement date uses effective, unreversed payment dates.
- Missing or inconsistent installment history: reject rather than confirm an incomplete ledger.
- Account switch during export: do not print/share the previous owner's records.
- Concurrent writes during snapshot reads: reject mixed data using the profile version.
- Missing parties and unsafe text: label missing names; HTML-escape all saved values.

### Task 1: Complete confirmation flow

**Files:** New `supabase/functions/tally-api/statements/settlement.ts`, new `apps/tally/src/features/statements/settlement*.ts(x)`, new shared `pdf-export` platform modules; modify `handler.ts`, statement PDF adapters, and `detail-screen.tsx`. Tests in existing app test directories and `supabase/tests/functions/settlement.test.ts`.

**Interfaces:** Backend `getSettlementSnapshot(uid, input, db)` returns owner-scoped records and server timestamp. Frontend `buildSettlement(input)` validates and returns a document model; `fetchSettlement(repo, obligationId)` decodes the snapshot. `exportHtmlPdf(title, prepareHtml, check)` reserves a web print window synchronously and checks the account before publishing. `SettlementPanel` previews and exports the refreshed confirmation.

- [x] Write and run failing accounting, snapshot, export, and component tests.
- [x] Implement the read-only endpoint, accounting model, escaped HTML, platform PDF helper, and responsive loan-detail panel.
- [x] Run focused tests, app typecheck/lint and full unit/component suites, backend suite, and confirmation browser flows.
- [x] Review the complete change and address findings.

**Release:** Commit only feature files, deploy the API, push main, and verify CI and production.

**Validation:** 220 unit tests, 194 component tests, 133 backend tests, 21 Expo checks, all-platform JavaScript exports, live API owner-isolation/reversal tests, and desktop/mobile confirmation browser flows pass.
