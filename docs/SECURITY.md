# Security and privacy

## Threat model in one paragraph
The app holds a family's complete financial picture. The main risks are
(1) one family seeing another's data, (2) a family member seeing something
another member marked private, (3) privilege escalation inside a family,
(4) leaked credentials or tokens, and (5) sensitive data left on a device or
in logs. Defences are layered so that a bug in one layer does not expose data.

## Controls

| Risk | Control |
| --- | --- |
| Cross-family access | RLS on every table; membership checked through `private.*` SECURITY DEFINER helpers; composite foreign keys make cross-family references impossible; storage paths must start with the family id and reads require a visible attachment/import row. Covered by `isolation.test.ts`. |
| Private items | `visibility` on accounts, cards, loans, investments, transactions. Private transactions are visible to their creator and the member who spent the money; transactions on private accounts are forced private by trigger. Receipts follow the transaction's visibility. |
| Privilege escalation | Column-scoped GRANTs (clients cannot write `role`, `status`, `user_id`, `is_system`, `source`, `created_by` after insert, …); role changes, invitations, merges and deletions go through RPCs that check roles; a family always keeps an admin; viewers are read-only. |
| Invitation abuse | 192-bit random tokens, only SHA-256 hashes stored, 1–30 day expiry, single use, optional email binding checked against the verified JWT email; invitation emails are built server-side and the function verifies the token hash, so it cannot be used to send arbitrary links. |
| Account data | Only the last 4 digits of account/card numbers (CHECK constraint `^[0-9]{4}$`); no PINs, CVVs, passwords or net-banking credentials anywhere. UI masks numbers as `•• 1234`. |
| Session & device storage | Supabase PKCE flow; session encrypted with AES-256 (key in iOS Keychain / Android Keystore via expo-secure-store, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`); offline transaction queue encrypted the same way; auth refresh only in foreground; React Query cache, outbox and preferences cleared on sign-out; Android `allowBackup=false`. |
| Transport | HTTPS to Supabase only. |
| Logging | `lib/logger.ts` redacts keys that look like amounts, titles, merchants, notes, emails, tokens; Edge Functions log event names and ids only. |
| Audit | Append-only `audit_logs` written by triggers for families, members, invitations, accounts, cards, categories, transactions, attachments, recurring, loans, trips, budgets, investments, imports and matches; readable by family admins. |
| Source statements | Imported rows are never deleted by deduplication (FK without cascade from rows to imports); imports are idempotent per file hash. |
| Data rights | JSON export of everything the user can see (`export_family_data`); account deletion via Edge Function (demotes/detaches memberships, deletes sole-member families, then the auth user); family deletion requires typing the family name. |
| Secrets | Only the anon key ships in the app; service-role key only inside Edge Functions. `.env*` files are git-ignored. |

## Reporting
Please report vulnerabilities privately to the repository owner rather than
opening a public issue.
