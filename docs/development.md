# Tally development

The application is Expo / React Native / TypeScript in `apps/tally`. Supabase backend code, migrations, and tests live in `supabase`. The retired Flutter/Firebase implementation and its tooling are available in Git history.

## Local development

Use Node 22.23.3, Python 3, Docker, and Supabase CLI 2.120.0. Set `TALLY_SUPABASE_CLI` if the CLI is outside PATH.

```sh
npm run install:app
python3 tool/start_supabase_local.py
```

Keep `supabase functions serve` running in a separate terminal, then run:

```sh
npm run start:local
```

Open http://localhost:7384. Local services use API port 56321, database port 56322, and Mailpit port 56324. Never reset the local database for frontend testing; integration suites create and remove their own temporary identities.

For an exported web build against the local backend:

```sh
python3 tool/build_expo_local.py
python3 tool/serve_expo_local.py
```

The exported application runs at http://localhost:7385. Local exports must not be publicly deployed.

## Validation

```sh
tool/check_expo.sh
node --test tool/tests/*.test.mjs
deno check --config supabase/functions/deno.json supabase/functions/tally-api/index.ts supabase/functions/tally-worker/index.ts
deno test --config supabase/functions/deno.json --allow-read=supabase/tests/fixtures supabase/tests/functions
supabase test db
```

See [Expo operations](operations/expo.md) for browser journeys, native builds, and web deployment. See [Supabase operations](operations/supabase.md) for backend integration suites and deployment. The committed CI workflow defines the full release checks.

## Historical documents

Older plans, architecture notes, screenshots, and verification reports record the retired implementation. Their Flutter/Firebase commands are historical; use the commands above and the current operations guides for active development.
