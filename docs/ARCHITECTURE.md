# Architecture

Family Finance is an Expo (React Native) app backed by Supabase. Business rules
that protect money and privacy live in PostgreSQL (constraints, triggers, RLS),
pure domain logic lives in a shared TypeScript package, and the app is a thin,
typed client on top.

```
┌──────────────────────────── apps/mobile (Expo, iOS + Android) ────────────────────────────┐
│ Expo Router screens ─► feature modules (api.ts / hooks.ts / components) ─► design system │
│        TanStack Query (server state) · Zustand (UI prefs, offline outbox) · RHF + Zod      │
└───────────────┬─────────────────────────────────────────────────────────────┬─────────────┘
                │ uses                                                        │ supabase-js (HTTPS, JWT)
┌───────────────▼──────────────┐                    ┌────────────────────────▼──────────────────┐
│ packages/core (pure TS)       │                    │ Supabase                                   │
│ money · dates · validation    │◄── also usable by ─┤  Auth (email, Google, Apple)               │
│ categorisation · dedup        │    Edge Functions  │  PostgREST ─► PostgreSQL (RLS everywhere)  │
│ insights                      │                    │  Storage (private buckets, RLS)            │
└───────────────────────────────┘                    │  Edge Functions (Deno): email, deletion    │
                                                     └────────────────────────────────────────────┘
```

## Repository layout

| Path | What lives there |
| --- | --- |
| `apps/mobile` | Expo SDK 58 app. Routes in `src/app`, everything else in `src/{components,features,lib,stores,theme,types}`. |
| `packages/core` | Framework-free domain logic with unit tests (Vitest). |
| `supabase/migrations` | Ordered SQL migrations: schema, RLS, RPCs, storage policies, reporting functions. |
| `supabase/functions` | Deno Edge Functions (`send-invitation`, `delete-account`). |
| `supabase/seed.sql` | Development data (two demo logins sharing a family). |
| `supabase/tests` | Database tests: migrations + RLS + calculations against real PostgreSQL. |
| `scripts/gen-db-types.mjs` | Generates `apps/mobile/src/types/database.ts` from the migrated schema. |

## Key decisions

### 1. Family is the tenant; RLS is the security boundary
Every family-owned row has `family_id`. RLS policies call `SECURITY DEFINER`
helpers in a non-exposed `private` schema (`my_family_ids()`,
`family_role()`, `can_write()`, `can_view_transaction()` …), so the app never
decides who can see what. Tests in `supabase/tests/db/isolation.test.ts`
assert that a member of family B sees nothing of family A across 24 tables,
the reporting RPCs and storage.

### 2. Cross-family references are impossible by construction
References between family-owned rows use **composite foreign keys**
`(family_id, x_id) → (family_id, id)`. A transaction cannot point at another
family's account, card, category or member even if application code is wrong.
(`ON DELETE SET NULL (column)` — PostgreSQL 15+ — keeps `family_id` intact.)

### 3. Members are not logins
`family_members.user_id` is nullable: a child, or a spouse who has not signed
up yet, is still a member who can be tagged as "who spent it". An invitation
can later *claim* that member, so their history follows them.
Every transaction records `created_by` (the login who entered it) and
`spent_by_member_id` (who actually spent it).

### 4. Money
* PostgreSQL: `numeric(14,2)`; never float.
* App: integer minor units (`Minor`) for arithmetic; `fromDb()` converts
  PostgREST JSON numbers or pg strings exactly; `parseAmountInput()` rejects
  more than two decimals instead of rounding silently.
* Formatting is deterministic (Indian grouping for INR, lakh/crore compact
  form) rather than device-`Intl` dependent.

### 5. No double counting
`transactions.type` ∈ `expense | income | refund | transfer`.
Card purchases are expenses on the card. Paying the card bill is a
**transfer** from a bank account to the card, which reduces the card's
outstanding and the bank balance but is never an expense. Refunds reduce
expenses (`expenses = Σ expense − Σ refund`). The shape is enforced by CHECK
constraints (a transfer must have a source and a destination and no category).

### 6. Reports are computed in SQL
`get_cashflow_summary`, `get_monthly_cashflow`, `get_category_spending`,
`get_member_spending` are `SECURITY INVOKER` (RLS applies, so private
transactions of other members are excluded from your view).
`get_account_balances` is `SECURITY DEFINER` so a shared account's balance
includes all its transactions, while still only returning accounts the caller
may see. Only base-currency transactions are summed; others are counted and
reported as excluded.

### 7. Visibility
`shared` or `private` on accounts, cards, loans, investments and
transactions. A private transaction is visible to its creator and to the
member who spent it. Every transaction on a private account is forced private
by a trigger.

### 8. Provenance, deduplication and audit
* `statement_imports` (one per file, unique per `file_sha256` → idempotent
  imports), `imported_statement_transactions` (every extracted row, kept
  forever), `transactions.import_row_id`, and `transaction_matches`
  (candidate duplicates and their resolution) form the reconciliation trail.
* The dedup engine (`packages/core/src/dedup`) classifies rows as
  confirmed / possible duplicate / unique using references, fingerprints,
  amount, direction, date tolerance and fuzzy description similarity. It never
  deletes anything.
* `audit_logs` is append-only and written by triggers on every money-related
  table and by RPCs (`category.merged`, …). Admins can read it.

### 9. Categorisation
Deterministic pipeline in `packages/core/src/categorize`: family user rules →
rules learned from corrections → India-focused merchant dictionary → keyword
rules. The add-transaction form suggests a category live; when the user picks
a different one, a *learned* rule is stored so the next "Sri Ganesh Stores"
lands in Groceries automatically. An AI stage can be added server-side later.

### 10. Offline-first writes
New transactions get a client UUID. If the device is offline (or the request
fails at the network level) the row goes into an **encrypted** outbox
(Zustand + AES key in the Keychain/Keystore) and is synced with
`INSERT … ON CONFLICT (id) DO NOTHING`, so retries can never duplicate.
Rejected rows are kept and shown as "Sync failed", never silently dropped.

### 11. Least privilege for clients
Beyond RLS, table privileges are column-scoped: clients cannot set
`is_system`, `source`, `role`, `status`, `token_hash`, etc. Role changes,
invitations, merges and deletion go through RPCs that check the caller's role
and invariants (e.g. a family always keeps an admin).

## Client architecture

* **Routing** — Expo Router. `(auth)` stack, `onboarding`, `invite/[token]`
  deep link, and `(app)` which is guarded (session → families → active
  family) and hosts the five tabs plus modal forms.
* **Feature modules** — `features/<domain>/{api.ts, hooks.ts, components/}`.
  `api.ts` is the only place that talks to Supabase; it throws `AppError`
  with user-safe messages. Hooks wrap TanStack Query with stable query keys
  (`lib/queryKeys.ts`), so invalidation after a write is one call.
* **State** — server state in TanStack Query; device preferences (theme,
  family/individual view, period, active family) in persisted Zustand; the
  offline outbox in encrypted persisted Zustand.
* **Design system** — `components/ui`: Text (typography scale), Card,
  Button, TextField, SelectField + PickerSheet, DateField, SegmentedControl,
  ListRow, Section (inset grouped), Chip, Avatar, IconBadge, Amount,
  ProgressBar, Skeleton, Empty/Error states, Toast and Confirm hosts.
  Tokens in `theme/tokens.ts` (semantic colours for light and dark). React
  Native Paper supplies dialogs/snackbars/portal and is themed from the same
  tokens.
* **Charts** — `react-native-gifted-charts` (SVG) for income-vs-expense bars
  and category donut.

## Extending

* **New bank/card statement format** — add a parser that outputs
  `ComparableTransaction` rows; dedup, categorisation and the import tables
  are format-agnostic.
* **New financial module** — add a migration with `family_id`, composite FKs,
  RLS via the `private.*` helpers, audit trigger; regenerate types; add
  `features/<module>`.
* **Bank integrations / market data** — write into the same import tables
  (`statement_imports` with a different source) or `investment_valuations`
  with `source = 'market_data'` and `is_verified = true` (clients cannot set
  those; only server code can).
