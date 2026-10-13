# Tally — Know what’s due.

Tally now uses **Expo / React Native / TypeScript** with **Supabase**. The primary app is [`apps/tally`](apps/tally). Start local testing with `npm run install:app`, `python3 tool/start_supabase_local.py`, `supabase functions serve`, and `npm run start:local`. See [Expo operations](docs/operations/expo.md) for web deployment, EAS builds, native notifications, offline behavior, and validation.

The Flutter/Firebase sections below describe the preserved migration reference.

## Product

Tally tracks borrowed money, money lent, recurring bills, installments, interest, repayments, and statements of account. It keeps currencies separate and preserves payment history through recorded corrections.

## Active application

- **Frontend:** Expo / React Native / TypeScript in `apps/tally`.
- **Backend:** Supabase Auth, Postgres, Storage, Edge Functions, and scheduled workers in `supabase`.
- **Local app:** http://localhost:7384 against the isolated local backend at port 56321.
- **Checks:** `tool/check_expo.sh`; backend SQL, Deno, and local integration commands are listed in `.github/workflows/ci.yml`.
- **Operations:** [Expo deployment, authentication, offline behavior, and device testing](docs/operations/expo.md).

Never reset the local database for frontend testing. Integration suites create and remove their own temporary identities.

## Migration reference

The root `lib`, `test`, `android`, and `ios` directories contain the preserved Flutter implementation. `functions` and `firebase` retain the earlier Firebase backend. These are migration references, not the current Expo build entry points. Existing migration work remains separate from active app changes.

The [original requirements](docs/product/requirements.md), [user experience](docs/product/experience.md), [financial engine](docs/architecture/financial-engine.md), and [Supabase operations](docs/operations/supabase.md) provide historical design and backend context. The Expo operations guide and current source define the active frontend behavior.
