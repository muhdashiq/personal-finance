# Roadmap

Each phase ends with the same gate: automated tests green, family isolation
tests extended to new tables, financial calculations validated against
hand-computed fixtures, UI reviewed on Android and iOS, and STATUS.md updated.

## Phase 1 – Core application ✅ (this milestone)
Authentication (email, Google, Apple) · family creation · invitations and
roles · dashboard · manual income/expense/transfer/refund entry · categories ·
transaction history · member-wise tracking · bank account & card registry ·
offline entry · data export and account deletion.

## Phase 2 – Financial imports (next)
1. **Upload** — pick PDF/CSV/XLSX (`expo-document-picker`), compute SHA-256
   on device, upload to the `statements` bucket, insert `statement_imports`
   (the unique index makes re-uploads idempotent).
2. **Process** — Edge Function `process-statement`:
   CSV/XLSX via column detection (date/description/debit/credit/balance/ref
   header synonyms per bank); PDF via text extraction with bank-specific
   templates (HDFC, ICICI, SBI, Axis, Kotak first), falling back to a
   generic table parser. Rows are normalised with `parseStatementDate`,
   `normalizeDescription`, `suggestTransactionType`, categorised with
   `categorize`, and reconciled with `reconcileBatch` against the account's
   transactions in the statement window ± 5 days. Results land in
   `imported_statement_transactions` and `transaction_matches`.
3. **Review UI** — import summary (total / new / duplicates / possible /
   failed / needs review), per-row edit of category, member, type; resolve
   possible duplicates (merge, keep both, ignore). Nothing uncertain is
   imported without a decision.
4. **Confirm** — RPC `confirm_import(import_id)` creates transactions with
   `source = 'statement_import'` and `import_row_id`, records resolutions in
   the audit log, and stores card statement metadata (statement balance,
   minimum due, due date).
5. **Card payments** — pair bank-side "CC PAYMENT" with card-side
   "PAYMENT RECEIVED" (`findCardPaymentPair`) into a single transfer.

Engines already done and tested: dedup, categorisation, date parsing.

## Phase 3 – Financial intelligence
Budgets (family, member, category, trip) with 75/90/100 % alerts written
idempotently to `budget_alerts`; weekly / monthly / yearly reports with
period-over-period comparisons; unusual-spending detection (z-score per
category over trailing months); PDF and Excel export (Edge Function
generating XLSX/PDF into Storage, shared via signed URL).

## Phase 4 – Liabilities and planning
Loans and EMIs with amortisation schedules (`emi_schedules`), principal vs
interest split, projected closure and remaining interest; recurring
transactions (rent, subscriptions, SIPs) materialised by a scheduled Edge
Function; card due-date tracking from statement metadata; push reminders via
Expo Notifications (`push_tokens`, `notification_preferences`).

## Phase 5 – Lifestyle finance
Trips and events (vacations, weddings, festivals, renovation) with budgets,
participants, daily spend, attaching imported transactions; investment
portfolio (mutual funds, stocks, ETFs, FD/RD, gold, PPF/EPF/NPS) with manual
valuations clearly marked as manual/estimated vs verified; family reports.

## Phase 6 – Advanced capabilities
Account Aggregator / bank integrations feeding the same import pipeline;
market data for investments (`valuation_source = 'market_data'`); optional AI
categorisation and insights server-side; cash-flow forecasting.
