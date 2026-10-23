# Tally with Supabase

Tally uses the Expo/React Native app in `apps/tally` with Supabase Auth, Postgres, Storage, Edge Functions, and scheduled workers. The retired Flutter/Firebase implementation is available in Git history. Removing that implementation does not delete or migrate any existing backend records.

## Run on this PC

Prerequisites: Node 22.23.3, Docker, Supabase CLI 2.120.0, and Python 3. If `supabase` is not on PATH, set `TALLY_SUPABASE_CLI` to the executable. Install app dependencies with `npm run install:app`.

```sh
python3 tool/start_supabase_local.py
supabase functions serve tally-api --no-verify-jwt
```

Keep the function server running. In another terminal:

```sh
npm run start:local
```

Open http://localhost:7384. Create an email/password account, finish onboarding, and add obligations. Supabase uses API 56321, PostgreSQL 56322, and local email inbox 56324. No production credentials are needed. The startup helper configures the local scheduler using keys held only in process memory.

A new stack applies migrations automatically. Never run `db reset` against a stack containing records you want to retain. Keep migrations in version control; use `supabase migration up --local` for subsequent migrations. Developers editing declarative schemas should iterate locally, then run `supabase db schema declarative sync --no-apply --name <change>`, review the generated SQL, and test a fresh isolated stack.

## Backend contract

Each feature has its own PostgreSQL table. Rows carry `user_id`, stable local IDs, schema-versioned repository JSON, optimistic versions, and server audit timestamps. Generated typed columns, owner-qualified foreign keys, normalized payment allocations, unique recurring keys, and deferred financial constraints protect the JSON projection. Trusted TypeScript services enforce financial rules independently of UI components.

Clients have read access through RLS, restricted to their active profile and live Auth session. They cannot write canonical financial tables, truncate them, read raw push tokens, or invoke service-only commit/worker APIs. Edge Functions verify real Auth identity and `session_id` before dispatching commands. Database helpers with elevated permissions reside in the unexposed `tally_private` schema and have explicit execute grants and fixed search paths.

A command reads the owner epoch, validates its envelope and references, and commits its receipt, payments, derived balances, activities, and jobs in one SQL transaction. A changed epoch retries the read set; a repeated command ID returns its original receipt only when type and payload hash match. Payments, reversals, allocations, confirmation evidence, and scheduled events retain traceable history. Remaining balances cannot be edited independently. Overpayments are rejected with a friendly explanation; currencies stay separate.

Due dates and billing periods remain civil date strings. Audit/scheduled instants are timestamps normalized for comparison. Saved obligation timezones govern financial dates and recurrence; changing the profile timezone does not move historical dates.

## Workers, reminders, and files

Cron wakes the trusted Edge worker each minute only when due jobs or deletion work exist. Owner-first SQL leases fence overlapping runs. Deterministic IDs prevent duplicate recurring periods and deduction events. Recurrence generates a bounded 90-day horizon; fixed price changes affect future instances. Variable periods remain unknown until an amount is supplied. Pause/end retain previous periods. Automatic mode records an assumed payment, confirmation mode waits for the user, and reported failure appends a reversal.

Dashboard/contact summaries derive from the immutable ledger, carry source/profile revisions, and refresh at the next civil boundary. Overdue status is computed against each obligation timezone. Bounded scans fail rather than publish truncated totals: currently 10,000 ledger records per collection and fewer than 490 summary mutations per projection. Large accounts need paged materialization before lifting these limits.

Reminders publish to the private inbox independently of push availability. Native local alerts require explicit OS permission. Push uses a separate retryable job, generic text, opaque IDs, expiry, per-device outcomes, and collapse IDs. Transport is at least once; a lost external response can cause a repeated alert. Only FCM's explicit UNREGISTERED result retires an unchanged token generation. Token ownership is exclusive; an active registration must be unregistered before another account binds the same token.

The `tally-attachments` bucket is private, limited to 10 MiB, and accepts JPEG/PNG/WebP/PDF. Clients cannot access bucket objects directly. Authenticated commands reserve an owned target, validate exact bytes/signature/checksum, finalize immutable uploads, download after ownership rechecks, and retire metadata before cleanup. No reusable download URLs escape to clients. Removing a file fences any earlier upload lease before deleting its bytes.

Deletion requires a real Auth session created within five minutes; refreshing an old token is insufficient. Acceptance changes the profile to deleting and immediately fences old JWT reads and writes. A retryable worker revokes sessions, removes owned Storage objects, deletes Auth/SQL records, and leaves a minimal private deletion tombstone. Local cleanup waits for open handles and erases only the exact owner/environment caches, outbox, receipts, and notification manifest. Unknown or foreign local schemas preserve a cleanup retry marker. Tombstones currently require operator-managed retention; do not treat them as financial backups.

## Offline behavior

Native devices can queue durable financial commands. Web users must enable trusted-device storage before private snapshots or the durable outbox are used. The public app shell can cache static assets independently. Offline reads show cached provenance; queued mutations do not become canonical paid balances. Reconnection replays frozen IDs, owner-bound dependencies, and receipts. Conflicts remain reviewable; account switches and accepted deletion close the old owner scope. Metadata/file transfer and credential changes require connectivity.

## Hosted deployment

Use separate dedicated Tally projects for staging and production. The Supabase MCP project currently connected to this workspace belongs to another application and must remain untouched. A working hosted Tally release requires a dedicated project's management access, public URL/key, Auth configuration, and deployed workers.

1. Link the dedicated project using `supabase link --project-ref <tally-ref>`. Verify its name and existing tables before any mutation. Run `supabase db push --dry-run`, then `supabase db push` against the verified project.
2. Deploy `tally-api` and `tally-worker` with `supabase functions deploy <name> --no-verify-jwt`. Gateway JWT verification is disabled for current publishable-key compatibility; each function performs its own authentication and authorization.
3. Generate a strong random job secret. Set `TALLY_JOB_SECRET` through the CLI's secret-file option or the dashboard. Store the same value in Vault as `tally_job_secret`, and the HTTPS project endpoint as `tally_project_url`. Never place server keys, service-account JSON, passwords, or job secrets in public build files, Git, logs, or command-line arguments. The migration installs the Cron schedule but missing Vault values fail closed.
4. Configure Auth's Site URL and exact permitted web/native redirect URLs. Production email confirmation should be enabled with configured SMTP. Configure Google OAuth credentials and Supabase's callback URL. Native redirects use `io.codebox.tally://auth-callback`; the Android/iOS handlers and PKCE client are included. Password recovery routes allow changing the password, then revoke sessions and require sign-in again.
5. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the dedicated project's public values in the build environment. Build:

```sh
npm run build:web
```

Deploy `apps/tally/dist` to a static HTTPS host with SPA fallback to index.html. Preserve the exported assets, fonts, and service worker. Cache versioned static assets and revalidate index/service-worker files. The exporter rejects missing or local backend configuration for production and verifies the referenced JavaScript bundles. See [Expo operations](expo.md) for Vercel configuration, native builds, and authentication redirects.

Optional FCM needs no Firebase database/auth backend. Store `TALLY_FCM_SERVICE_ACCOUNT_JSON` only as a server secret with permission to send through the chosen FCM project. Configure native push credentials and distribution through the Expo/EAS workflow described in [Expo operations](expo.md). Without external push credentials, local/in-app reminders remain available and remote push is unconfigured.

Before production use, configure backups and retention suitable for financial history, Auth abuse/rate controls, billing limits/alerts, and monitoring of stale/failed jobs, projection revisions, and deletion retries. App Check is a Firebase service and does not protect the Supabase API; verified Auth sessions, RLS, server validation, and restricted worker secrets provide its access controls.

## Verification

```sh
tool/check_expo.sh
node --test tool/tests/*.test.mjs
supabase test db
deno test --config supabase/functions/deno.json --allow-read=supabase/tests/fixtures supabase/tests/functions
python3 tool/test_supabase_financial.py
python3 tool/test_supabase_recurring.py
python3 tool/test_supabase_devices.py
supabase db advisors --local --type security --level warn --fail-on error
```

HTTP suites refuse nonlocal endpoints, create temporary Auth identities, use actual Edge/SQL/Storage services, and clean up only their own fixtures. Fresh migration replay uses a different project ID and ports; it must not reset the user's existing stacks. CI also runs the assigned-installment, borrower-sharing, file, device, and recurring-after-payment suites plus real browser journeys.
