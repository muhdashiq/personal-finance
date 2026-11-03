# Family Finance

A family-first personal finance app: one place where a household tracks
expenses and income, bank accounts and credit cards, and sees where the money
goes — together, with private items kept private.

**Stack:** Expo SDK 58 · React Native · TypeScript · Expo Router · TanStack Query ·
Zustand · React Hook Form + Zod · React Native Paper · gifted-charts ·
Supabase (Postgres + RLS, Auth, Storage, Edge Functions)

> **Status:** Phase 1 (core application) is implemented. Statement import,
> budgets, EMIs, trips and investments are designed in the database and on the
> roadmap. See [docs/STATUS.md](docs/STATUS.md) for exactly what works today.

## What you can do today

* Sign up with email, Google or Apple; create a family; invite your spouse by
  email or link; add children as members without a login
* Add expenses, income, transfers (e.g. paying a credit card bill) and refunds,
  with category, member, account/card, payment method, receipt and a private flag
* Get category suggestions as you type — and the app learns from your corrections
* Keep adding transactions offline; they sync safely when you reconnect
* Register bank accounts and credit cards for anyone in the family and see
  calculated balances, card outstanding and utilisation
* Dashboard and insights for the family or just you: income vs expenses,
  savings rate, spending by category and by member, 6/12-month trends,
  data-backed insights
* Export your data or delete your account

## Repository

```
apps/mobile        Expo app (iOS, Android)
packages/core      Domain logic: money, dates, validation, categorisation, duplicate detection, insights
supabase/          Migrations, RLS, RPCs, Edge Functions, seed data, database tests
scripts/           Database type generator
docs/              Architecture, setup, build & deploy, security, roadmap, status
```

## Quick start

```bash
npm install
supabase start && supabase db reset          # local backend + demo data
cp apps/mobile/.env.example apps/mobile/.env.local   # paste URL + anon key from `supabase status`
cd apps/mobile && npx expo start
```

Demo logins: `ashiq@example.com` / `sara@example.com`, password `FamilyFinance#2026`.

Full instructions: [docs/SETUP.md](docs/SETUP.md) · builds:
[docs/BUILD_AND_DEPLOY.md](docs/BUILD_AND_DEPLOY.md).

## Quality

```bash
npm run test:core     # 106 unit tests (money, dates, dedup, categorisation, insights, validation)
npm run test:db       # 71 database tests (RLS isolation, roles, invitations, calculations)
npm run test:mobile   # 13 app tests (row mapping, offline queue, error handling)
npm run typecheck && npm run lint
```

## Documentation

* [Architecture](docs/ARCHITECTURE.md) — design decisions and how to extend
* [Status](docs/STATUS.md) — working vs planned, verification log
* [Roadmap](docs/ROADMAP.md) — phases 2–6
* [Security](docs/SECURITY.md) — threat model and controls
