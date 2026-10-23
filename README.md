# Tally — Know what’s due.

Tally now uses **Expo / React Native / TypeScript** with **Supabase**. The primary app is [`apps/tally`](apps/tally). Start local testing with `npm run install:app`, `python3 tool/start_supabase_local.py`, `supabase functions serve`, and `npm run start:local`. See [Expo operations](docs/operations/expo.md) for web deployment, EAS builds, native notifications, offline behavior, and validation.

## Product

Tally tracks borrowed money, money lent, recurring bills, installments, interest, repayments, and statements of account. It keeps currencies separate and preserves payment history through recorded corrections.

## Active application

- **Frontend:** Expo / React Native / TypeScript in `apps/tally`.
- **Backend:** Supabase Auth, Postgres, Storage, Edge Functions, and scheduled workers in `supabase`.
- **Local app:** http://localhost:7384 against the isolated local backend at port 56321.
- **Checks:** `tool/check_expo.sh`; backend SQL, Deno, and local integration commands are listed in `.github/workflows/ci.yml`.
- **Operations:** [Expo deployment, authentication, offline behavior, and device testing](docs/operations/expo.md).

Never reset the local database for frontend testing. Integration suites create and remove their own temporary identities.

## Repository layout

The active app, assets, and frontend tests live in `apps/tally`. Backend code, migrations, tests, and recurrence fixtures live in `supabase`; `tool` contains the current build and validation scripts. Expo generates native projects from the app configuration when needed.

The retired Flutter/Firebase implementation is available in Git history. Older design plans and verification reports describe that implementation. The [original requirements](docs/product/requirements.md), [user experience](docs/product/experience.md), and [financial engine](docs/architecture/financial-engine.md) provide historical design context; the [Expo operations guide](docs/operations/expo.md), [Supabase operations guide](docs/operations/supabase.md), and current source define active behavior.
