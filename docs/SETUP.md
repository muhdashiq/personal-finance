# Local setup

## Prerequisites

* Node.js 20+ and npm 10+
* [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker (for the local backend)
* For devices: Expo Go is **not** enough (the app uses native modules such as
  Apple Sign-In and secure storage) — use a development build (see
  BUILD_AND_DEPLOY.md), or the iOS Simulator / Android Emulator with
  `npx expo run:ios|android`.

## 1. Install

```bash
npm install
```

## 2. Start Supabase locally

```bash
supabase start          # Postgres, Auth, Storage, Studio on localhost
supabase db reset       # applies supabase/migrations and supabase/seed.sql
```

`supabase status` prints the API URL and anon key. Demo logins created by the
seed:

| Email | Password | Role |
| --- | --- | --- |
| ashiq@example.com | FamilyFinance#2026 | admin |
| sara@example.com | FamilyFinance#2026 | member (spouse) |

Local emails (sign-up confirmations, password resets) are visible in Inbucket
at http://localhost:54324.

Optional — Edge Functions:

```bash
cp supabase/functions/.env.example supabase/functions/.env   # fill in if you want emails
supabase functions serve --env-file supabase/functions/.env
```

## 3. Configure the app

```bash
cp apps/mobile/.env.example apps/mobile/.env.local
# set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (hosted project: Project Settings →
# API Keys → "Publishable key"; local stack: `supabase status`), then `npx expo start -c`
```

On a physical device use your hosted project URL, or your computer's LAN IP instead of
`127.0.0.1` for a local stack (127.0.0.1 on the phone is the phone itself).

## 4. Run

```bash
cd apps/mobile
npx expo start            # then press i / a, or scan with a development build
```

## Tests and checks

```bash
npm run test:core                        # domain logic (Vitest)
npm run test:db                          # database: migrations, RLS, calculations
npm run test:mobile                      # Jest
npm run typecheck
npm run lint
```

The database tests need a PostgreSQL 15+ server on which they can create
databases as a superuser — for example
`docker run -d -p 54329:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16`
and `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres`
(default: `postgres://postgres@127.0.0.1:54322/postgres`). They apply
`supabase/tests/platform-stub.sql` (roles, `auth.uid()`/`auth.jwt()`, storage
tables) plus every migration into a template database and run each test file
against its own clone, so they never touch your development data and need no
Supabase CLI.

## Regenerating database types

After changing migrations:

```bash
supabase db reset
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres npm run db:types
# or, with the CLI: supabase gen types typescript --local > apps/mobile/src/types/database.ts
```

## Auth providers

* **Google** — create an OAuth client (type *Web application*) in Google
  Cloud; add `https://<project>.supabase.co/auth/v1/callback` as an
  authorised redirect URI; set the client id/secret in Supabase → Auth →
  Providers → Google (or the env vars referenced in `supabase/config.toml`).
* **Apple** — enable *Sign in with Apple* for the bundle id
  `com.familyfinance.app`; in Supabase → Auth → Providers → Apple add the
  bundle id (native iOS sign-in) and, for Android/web, a Services ID and
  secret.
* **Redirect URLs** — add `familyfinance://auth-callback` and
  `familyfinance://sign-in` under Auth → URL Configuration.
