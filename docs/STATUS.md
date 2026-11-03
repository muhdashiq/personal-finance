# Implementation status

Last updated: 3 Nov 2026 · Current milestone: **Phase 1 – Core application**

This file separates what works today from what is designed or planned.

## ✅ Working (Phase 1)

| Area | What works | Where |
| --- | --- | --- |
| Authentication | Email/password sign-up & sign-in, password reset, Google OAuth (PKCE via system browser), Sign in with Apple (native on iOS, OAuth elsewhere), encrypted session storage, token refresh only in foreground | `features/auth`, `(auth)/*` |
| Families | Create family (seeds default categories), multiple families per user with switching, rename, delete (type-to-confirm) | `onboarding.tsx`, `settings.tsx`, `create_family`, `delete_family` |
| Invitations | Email-bound or open link invitations, 7-day expiry, hashed tokens, accept/decline in app or via `familyfinance://invite/<token>`, revoke, claim an existing no-login member, optional email delivery via Edge Function | `family/invite.tsx`, `invite/[token].tsx`, `send-invitation` |
| Members & roles | Admin / member / viewer, add members without a login (children), edit names, promote/demote (last admin protected), remove/leave with history kept | `(tabs)/family.tsx`, `family/member/[id].tsx` |
| Transactions | Add / edit / delete expense, income, transfer, refund; category + subcategory, date, member, account or card, payment method, merchant, notes, private flag, receipt photo | `transaction/*`, `TransactionForm` |
| History | Grouped by day, infinite scroll, search (title/merchant/notes), filters by type, member and period | `(tabs)/transactions.tsx` |
| Offline | Create transactions offline; encrypted queue; idempotent sync on reconnect/foreground; failed items surfaced with retry/discard | `transactions/outbox.ts` |
| Categories | Default tree (household, food, transport, family, financial, lifestyle, income), create, rename, recolour, archive, delete, merge (moves transactions, rules, budgets) | `categories/*`, `merge_categories` |
| Auto-categorisation | Live suggestion while typing; learns a rule when you choose a different category | `core/categorize`, `useSaveTransaction` |
| Accounts & cards | Register bank accounts and credit cards for any member (last 4 digits only), private/shared, status; calculated bank balances, card outstanding and utilisation | `(tabs)/accounts.tsx`, `get_account_balances` |
| Dashboard | Family vs "just me" view, period selector, income / expenses / saved / savings rate with comparison, bank & card totals, 6-month income vs expenses chart, category donut, who-spent breakdown, insights, recent transactions, empty and loading states | `(tabs)/index.tsx` |
| Insights | Period comparison tiles, highlights, 6/12-month trend, spending/income by category, by member | `(tabs)/insights.tsx`, `core/insights` |
| Settings & privacy | Profile name, light/dark/system theme, JSON data export, sign out, account deletion (Edge Function) | `settings.tsx`, `delete-account` |
| Security | RLS on every table, composite FKs, column-scoped grants, audit log, private storage buckets with RLS, no full account numbers, Android backups disabled | migrations, `docs/SECURITY.md` |

## 🧱 Built and tested, no UI yet

* **Duplicate detection engine** — confirmed/possible/unique classification,
  reference & fingerprint matching, overlapping statements, same-file
  repeats, card-payment pairing, refund/reversal detection, statement date
  parsing (`packages/core/src/dedup`, 26 tests).
* **Database for later phases** — statement imports, imported rows,
  transaction matches, loans & EMI schedules, budgets & category
  allocations & alert log, trips/events & participants, investments,
  investment transactions & valuations, recurring transactions, tags,
  notifications, notification preferences, push tokens — all with RLS and
  covered by the cross-family isolation test.

## 🗺️ Planned

See [ROADMAP.md](ROADMAP.md). In short: Phase 2 statement import & reconciliation
UI, Phase 3 budgets and weekly/yearly reports with PDF/Excel export, Phase 4
loans/EMIs/recurring payments and push reminders, Phase 5 trips/events and
investments, Phase 6 bank integrations, market data, forecasting.

## Verification log (this milestone)

| Check | Result |
| --- | --- |
| `packages/core` unit tests (Vitest) | 106 passed |
| Database tests (`supabase/tests`, PostgreSQL 16, all migrations + seed) | 71 passed — includes family isolation across 24 tables, roles, invitations, exact money calculations, card double-counting, visibility, merges, account deletion, seed consistency |
| Mobile unit tests (Jest, jest-expo) | 13 passed |
| TypeScript (`tsc --noEmit`) | clean in core, db-tests, mobile |
| ESLint (eslint-config-expo) | 0 errors (4 informational React Compiler notes on react-hook-form `watch`) |
| Edge Functions (`deno check`) | clean |
| Metro bundles (`expo export`) | Android ✅, iOS ✅, Web ✅ |
| Visual check | Sign-in / sign-up rendered on web at phone size, light and dark |

**Not yet verified in this environment** (no Docker/Supabase project and no
device or simulator were available):

* Running the app against a live Supabase stack end to end (sign-up → create
  family → invite → add transactions → dashboard). The SQL behind every
  screen is covered by the database tests, and the client code typechecks
  against generated database types, but the full UI flow still needs a manual
  pass with `supabase start` (see SETUP.md).
* Native builds on Android and iOS devices (EAS build profiles are in place).
* Google/Apple sign-in (requires provider credentials).
* Receipt upload (requires Supabase Storage).
