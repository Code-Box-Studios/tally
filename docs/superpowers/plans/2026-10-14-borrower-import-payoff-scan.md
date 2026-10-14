# Four financial workflow improvements

**Goal:** Implement the user's selected private borrower view, CSV import, payoff simulator, and receipt scanning.

**Spec:** `docs/superpowers/specs/2026-10-14-borrower-import-payoff-scan.md`

**Architecture:** Existing Expo screens and shared UI, integer-money domain calculations, owner-scoped command queue, Supabase Edge commands, and PostgreSQL owner-lock commits.

**Tech stack:** TypeScript, Expo/React Native Web, Supabase/PostgreSQL, Vitest/Jest, Deno, pgTAP, browser OCR/native text recognition.

## Global constraints

User explicitly authorized implementation and working on main. No new worktree. Preserve unrelated changes. No automatic payment creation from OCR or borrower submissions. No guessed interest savings. No broad cross-owner RLS. No silent partial imports. Reuse existing auth, command receipts, and financial validation.

## Task 1: Borrower access and proof review

Owner: primary agent. Add owner-qualified share/submission tables and expose them through the existing owner repository. Implement invitation creation/acceptance/revocation, sanitized shared views, draft/submitted proof, private attachments, and atomic approval/rejection. Add owner detail panel, shared-with-me screen, and navigation. Write authorization/financial tests first, then implementation. Generate an additive migration from declarative schema and run local pgTAP tests. Expected: unauthorized users cannot read or mutate shares, retries cannot duplicate payments, and revocation fences borrower writes.

## Task 2: CSV import

Owner: feature_import agent. Add CSV parser, mapping/preview/import screen and `/settings/import`. Extend `execute(name, payload, stableId?)` and queue enqueue with optional durable IDs. Parent adds Settings link. Write parser, import validation, duplicate, stable-ID, and component tests before implementation. Expected: only selected valid rows save and repeated imports cannot duplicate commands.

## Task 3: Payoff simulator

Owner: feature_payoff agent. Add pure projection, component, and tests. Interface: `PayoffSimulator({ obligation, instances, today, onDone? })`. Parent wires loan detail. Tests cover fixed interest, exact balances, partial/irregular schedules, zero extra, huge extra, month ends, and missing data. Expected: accurate timing with no ledger writes.

## Task 4: Receipt scanning

Owner: feature_scan agent. Add OCR adapters, parser/review, payment form integration, dependencies, and demand-loaded assets. Interface: `ReceiptScanReview({ currency, ownerKey, onApply, disabled? })`; draft contains optional `amount`, `paymentDate`, and `reference`. Parent may reuse in borrower proof form. Test extraction ambiguity, currency mismatch, cancellation, explicit apply/save, and stale results. Expected: a synthetic screenshot is recognized locally without a financial command or receipt upload.

## Task 5: Integration and verification

Parent integrates entry points and coordinates shared interfaces. Run typecheck/lint, unit/component/backend/SQL tests, web and native JavaScript exports, and desktop/mobile browser journeys including two-account sharing. Review the complete change with fresh context, fix material findings, and verify again where changes justify it. Deploy only the reviewed additive schema and checked application/backend; report physical-device limits honestly.

## Shared interfaces and review focus

- Import owns session/queue edits; primary does not edit those files concurrently.
- Scanner owns package files, payment form, and OCR web build asset hooks.
- Payoff owns isolated payoff modules; primary owns detail-screen integration.
- Primary owns Settings index, shared navigation, borrower API/schema, and feature documentation.
- Financial approval must reuse the existing finite-payment engine inside the same owner command as the submission status change.
