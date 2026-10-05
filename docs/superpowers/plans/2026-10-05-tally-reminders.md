# Tally Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user's established execution method is inline on main, followed by one fresh whole-plan reviewer.

**Goal:** Deliver owner-private due reminders, an inbox and optional device alerts without changing financial history or depending on an open client.

**Architecture:** Pure civil scheduling feeds deterministic reminder jobs, guarded owner metadata commands and Firestore inbox records. Trusted workers use persisted leases and check canonical state before delivery. Typed repositories and owner-scoped Riverpod controllers keep UI, Firebase, notification SDKs and business rules separate.

**Tech Stack:** Flutter/Dart, Material 3, Riverpod/go_router, official FlutterFire Messaging, native local notification adapter, TypeScript Firebase Admin/Functions, Firestore/Authentication emulators.

**Spec:** docs/superpowers/specs/2026-10-05-tally-reminders-design.md

## Global Constraints

- Work directly on main; preserve user-owned `.ignore`. No feature branches/worktrees, Supabase, banking integration, fake private records or foreign-exchange totals.
- Preserve original Tally design, strict Dart analysis and stable typed wire enums. All private data is owner-scoped; trusted callables authenticate and enforce App Check outside emulators.
- Canonical preferences `notificationPreferences/default`; migrate legacy `current` choices/revision. At most eight distinct offsets0–365, strict HH:mm, equal quiet endpoints disables quiet hours. Default enabled all six kinds, offsets[3,0],09:00, quiet21:00–08:00, push/local off, sensitive external text false.
- Financial due dates1900–2199; use existing pinned597 IANA zones and DST resolver. Schedule saved due zone, quiet hours current profile zone. Immutable recurring policies; finite missing policies use canonical preferences.
- Planning window today−7 through today+90 civil days, external expiry24 hours, overdue+1/+3/+7 then+7n. Max32 planned events/transaction and100 retained periods/reconciliation page.
- Generic external text only; no names/amounts/notes/contact details/tokens in logs. Device token documents and global token bindings are client-inaccessible. Stale device cutoff90 days.
- Job leases6 minutes, dispatcher≤25 jobs/450sec, persisted generation fences; check all reads before writes. Notification commands do not advance financial ledger/projection revision.
- Each task gate: `flutter analyze && flutter test --reporter expanded && npm --prefix functions run check && npm run test:emulators`, real Dart hot reload/runtime inspection after Dart changes. Actual test output is authoritative; real FCM/APNs/index availability remains a staging/native release check.

## Review Focus

1. A payment, reversal, due-date edit or preference/profile-zone change overlaps a leased preparation/delivery: only current owner state may publish/send, closed periods suppress unsent events, and corrected outstanding periods can remind again (Tasks2–3).
2. An installation/token moves between owners while sign-out is offline or send is ambiguous: external text stays generic, bindings and invalid-token cleanup cannot affect a newer owner/token, and late callbacks cannot restore old-owner state (Tasks4–5).
3. Saved due zone and profile quiet zone straddle DST gap/overlap or midnight: civil offset/cadence and quiet-end postponement keep the original due date unchanged (Tasks1/3).
4. A returning user has many long-overdue periods, paused/ended bills and unknown amounts: bounded continuation avoids floods/truncation, retained dues still remind, and an estimate is never counted as payable (Tasks1/3/5).
5. Denied/unsupported notification permission, missing APNs/VAPID, failed transport or stale cache: the inbox stays useful, no SDK request crosses emulator/owner boundaries, and success copy reflects the actual channel capability (Tasks4–5).

---

### Task 1: Canonical reminder policy and pure civil schedule

**Files:** Create functions/src/notifications/{policy,schedule}.ts and functions/test/{notification_policy,notification_schedule}.test.ts. Create lib/features/notifications/domain/{notification_preferences,reminder_entry,reminder_schedule}.dart, test/features/notifications/{notification_preferences,reminder_schedule}_test.dart. Use existing recurring/scheduled_time.ts, shared/validation.ts civilDate and shared/zone_data.ts; Dart core/dates/{local_date,scheduled_time,timezone_catalog}.dart and recurring_schedule.dart ReminderPolicy.

**Interfaces:** `ReminderKind = 'upcoming'|'dueToday'|'overdue'|'automaticUpcoming'|'automaticConfirmation'|'owedToMe'`; `NotificationPolicy` exact canonical preference fields except audit/revision. `defaultNotificationPolicy():NotificationPolicy`, `validateNotificationPolicy(input:unknown):NotificationPolicy`, `migrateNotificationPolicy(legacy:Record<string,unknown>):NotificationPolicy`. `ReminderSubject` instanceId/obligationId/section/dueDate/timezone/paymentMode/closed/amountMinor nullable/remainingMinor nullable/requiresDeductionConfirmation/reminderPolicy nullable; `ReminderPlan` kind/phase/civilTargetDate/scheduledAt. `planReminders(subject,preferences,profileTimezone,now):readonly ReminderPlan[]`, `afterQuietHours(instant,profileTimezone,quietStart,quietEnd):Date`, `reminderId(uid,instanceId,kind,civilDate,preferenceRevision,policyRevision):string`. Dart equivalent strongly typed preferences, entry kind/status/phase and civil local schedule for native alerts with injected clock.

- [ ] Write pure tests: defaults/migration preserve false/push choices; unknown keys/types/kinds, duplicate/9 offsets, −1/366, malformed HH:mm rejected; overnight/daytime/equal quiet hours; New York spring gap and autumn overlap with Manila quiet zone; due offsets across month/leap year; exact overdue1/3/7/14/21 cadence; 100-year overdue returns bounded next-window events; manual/auto/confirmation/owed-to-me, disabled/paid/skipped suppression; variable null remains null; identical IDs stable, owner/preference/policy changes distinct. Mirror fixed-date schedule examples in Dart.
- [ ] Run focused Dart and `npm --prefix functions run check`. Expected: missing notification modules/interfaces FAIL. Distinguish fixture/compile mistakes from behavioral RED.
- [ ] Implement pure validators/planner using existing civil/DST helpers, no Firebase SDK in domain. Document boundary behavior at2199 rather than computing unsupported2200 financial dates.
- [ ] Run focused tests and entire task gate. Expected: all specified assertions PASS, existing financial behavior unchanged. Actual hot reload/runtime errors clean.
- [ ] Commit `feat: define notification policy and civil reminder schedules`; named task-done whole gate.

### Task 2: Trusted preferences and private inbox commands

**Files:** Modify functions/src/shared/commands.ts, accounts/profile.ts, index.ts; create notifications/{preference_service,inbox_service}.ts. Extend OwnerCommandContext only for bounded owned-query reads needed by services. Add Functions/emulator tests. Create Dart notifications/domain/notification_repository.dart, data/{notification_dto,firestore_notification_repository}.dart, presentation/notification_providers.dart and repository/provider tests. Modify firestore.rules only if canonical missing-document semantics requires it; preserve client write denial.

**Interfaces:** `executeMetadataCommand<P,R>(uid,input,type,validate,handler,db):Promise<R>` shares active-owner/envelope/payload-hash/permanent receipt checks with executeOwnerCommand, with internal financial-write choice; legacy financial API remains unchanged and always advances ledger. `updateNotificationPreferences(uid,input,db)` payload expectedRevision/full policy; `markReminderRead(uid,input,db)` payload reminderId/expectedRevision; `setObligationReminder(uid,input,db)` payload obligationId/expectedRevision/ReminderPolicy. Preferences return canonical revision; read command only changes readAt/revision. `NotificationRepository` owner, watchPreferences(), watchInbox({limit=50}), getInbox({after,limit=50}), updatePreferences(ActionId,loadedRevision,policy), markRead(ActionId,entryRevision,id), setObligationPolicy(...). Typed DTOs use checked timestamps/currency/IDs/enums, owner-bound query cursor. Inbox query visible=true, scheduledAt<=now, scheduledAt DESC/ID DESC; add actual composite index. Providers autoDispose and declare owner/gateway dependencies.

- [ ] Write emulator RED tests: old-owner/authless denial, legacy bootstrap migration/new canonical seed, duplicate retry durable receipt, altered payload ID conflict, stale preference revision, invalid exact fields, metadata leaves ledger revision and projection job unchanged; unread/read ownership; finite policy edit retains payments and rejects stale parent. Write Dart strict mapping/query/owner-cursor/cancelled/unknown amount tests.
- [ ] Run focused tests. Expected: absent trusted commands/interfaces FAIL; owner Rules existing protections may characterize GREEN, not forced false RED.
- [ ] Implement commands/migration/repository, canonical write/read path and inbox index. Bootstrap migration preserves audit creation time and revision; no financial recalculation for mark-read/preferences. Finite policy changes increment parent revision and enqueue reminder reconciliation without changing amounts.
- [ ] Run whole gate and real hot reload/runtime inspection. Expected: commands atomic/idempotent/private, metadata balances unchanged, all suites PASS.
- [ ] Commit `feat: add private notification preferences and inbox`; named task-done whole gate.

### Task 3: Persisted reminder preparation and delivery scheduling

**Files:** Create functions/src/notifications/{reminder_jobs,preparation,reconciliation,delivery}.ts; modify jobs/dispatch.ts, recurring/instance_service.ts, index.ts and indexes for actual job/read queries. Add pure/job/emulator tests and architecture/notification-contract.md.

**Interfaces:** `enqueueOwnerReminders(uid,db,now?)` deterministic owner reconciliation job; triggered from financial ledger, profile and preference changes. `reconcileOwnerReminders(jobId,leaseToken,db,now?)` pages100 retained instances, captures ledger/profile/preference revisions and stages deterministic period jobs; cancellation/restart guarded on revision change. `claimReminderJob(jobId,db,now)` returns owner/token/generation; `prepareReminders(jobId,token,db,now?)` validates canonical parent/period/currentprefs and plans≤32 events, cancels obsolete unsent entries, preserves sent history, schedules next daily extension. `deliverReminder(jobId,token,db,transport,now?)` publishes due private inbox visibility, rechecks state before optional external sends and retains failed inbox. `NotificationTransport` injected `send({token,title,body,data}):Promise<delivered|invalid|retry>`; Task4 real FCM. No production network in emulator.

- [ ] Write RED emulator tests: finite+recurring creation preparation; duplicate generation/preparation/delivery; pause/end retained dues; paid/cancelled/skip suppress; unknown variable; partial/reversed payment rearm; preferences changed while leased, profile quiet-zone change, due-edit invalidates old job; expired token cannot publish/finish; >100 periods cursor and live mutation guard; delayed overdue window/inbox without expired external flood. Assert canonical amounts/payment records unchanged.
- [ ] Run focused tests. Expected: absent reminder workers FAIL. Implement bounded jobs and generic dispatch branches with existing6-minute fence/reserves; reminderPreparation terminal jobs may rearm, automaticDeduction terminal jobs cannot.
- [ ] Run full gate. Expected: all races/idempotency/pagination assertions PASS. Add exact composite queries, redacted diagnostic errors and documented operational repair path.
- [ ] Commit `feat: schedule idempotent server reminders`; named task-done whole gate.

### Task 4: Private multi-device registration and retry-safe FCM transport

**Files:** Create functions/src/notifications/{device_service,fcm_transport,device_cleanup}.ts; extend metadata context with explicit transactionally guarded global token binding operations, client-denied notification delivery/binding paths; index.ts callable/cleanup exports; emulator/transport tests. Add sanitized device DTO/model/repository methods in notification feature.

**Interfaces:** `registerNotificationDevice(uid,input,db)` exact installationId/platform/token/permission/channel/appVersion/expectedRevision; `unregisterNotificationDevice(uid,input,db)` installationId/expectedRevision; `listNotificationDevices(uid,input,db)` sanitized bounded pages. Private `notificationTokenBindings/{sha256(token)}` one active owner/installation/generation; owner device token generations monotonically advance. `FcmNotificationTransport` uses Admin Messaging generic payload/ID-only data, configurable real transport disabled on demo-emulator boundary. `cleanupNotificationDevices(db,now,limit=100)` bounded90-day inactivity and compare-generation invalid cleanup. Delivery receipts separate client-inaccessible collection, one logical reminder/device/generation.

- [ ] Write RED tests: two devices, token rotate, token moved to second owner deactivates first, foreign/stale unregister cannot delete newer binding, invalid response races rotation, stale90-day bounded cleanup, active account fence, malformed fields; generic payload has no amount/name/notes/contact text, retry/ambiguous send retains inbox and logical ID, no real FCM under demo emulator.
- [ ] Implement commands/bindings/transport and receipt state, rechecking binding/currentprefs/period before send and after result. Do not claim exactly-once external delivery or store/log token in sanitized responses.
- [ ] Run full gate. Expected: private Rules deny direct device/global/delivery reads/writes; deterministic tests pass, no demo remote send. Live FCM acceptance/device receipt remains release gate.
- [ ] Commit `feat: protect notification device ownership and FCM delivery`; named task-done whole gate.

### Task 5: Reminder inbox, settings and platform notification adapters

**Files:** Create notifications/presentation/{reminders_screen,notification_settings,reminder_tile,notification_session}.dart and data/{firebase_messaging_adapter,local_notification_adapter,installation_store}.dart with platform-specific implementations. Add official firebase_messaging, flutter_local_notifications and persistent nonsecret installation store dependencies. Modify routing/bell/settings/auth signout/bootstrap runtime config, web/firebase-messaging-sw.js plus public-config builder, Android/iOS required capabilities. Tests repository/provider/session/widgets plus actual browser tool and docs/quality/reminders-verification.md/screenshots.

**Interfaces:** `NotificationPlatform` permission/capability state, explicit requestPermission(), tokenChanges/openedEvents/initialMessage, owner-bind/clear; `LocalReminderScheduler.reconcile(uid,entries,{limit=50})`, cancelOwner(uid); `NotificationSession` per-owner cancellation/generation, refresh binding on token changes, dispose/cancel schedules and bounded unregister≤3sec before signout, reject late completions. Installation ID persisted per app installation, no credential/financial storage in this adapter. `ReminderIntent` only validated reminder/obligation/instance IDs passed through existing private routing. Session provider does not prompt or register real messaging in preview/demo mode.

- [ ] Write RED tests for inbox paging/unread/mark-read/exact period route, all preference controls/time/offset/quiet validation/conflict/uncertain retry, finite reminder edit, permission denied/unsupported/missing VAPID capability, token refresh/owner switch/unregister timeout/signout cancellation, single local-vs-push choice,50 pending schedules/generic payload and stale cache. Widget sizes320/375/800/1440 at200% text and keyboard/dark/light.
- [ ] Implement the original-theme private inbox/settings, action-only permission requests and separate official SDK adapters. Inspect current SDK package examples/signatures; rebuild after adding messaging. Web service worker public config is validated generated runtime data, never auth URLs/secrets; local background generic notifications never reveal financial details.
- [ ] Run entire task gate, actual hot restart/reload/runtime inspection and synthetic browser preference/inbox/ownership/signout. Capture genuine mobile/desktop images. Document emulator stub versus actual device capability and staged APNs/VAPID gates accurately.
- [ ] Commit `feat: connect reminder inbox and notification settings`; named task-done whole gate.

One fresh whole-plan review follows all five tasks with the five Review Focus
cases and every ledger Ruling. Re-grade by effect; one Important/Critical
RED→GREEN fix pass, minors ledgered, no re-review. Preserve all ledgers for the
M8 exhaustive handoff and continue M6 without a milestone pause.
