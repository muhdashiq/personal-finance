# Build and deploy

## Backend (Supabase)

1. Create a project at supabase.com (region close to your users, e.g. Mumbai
   for India).
2. Link and push the schema:
   ```bash
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push                       # applies supabase/migrations
   ```
   Do **not** run `seed.sql` against production.
3. Deploy Edge Functions and set secrets:
   ```bash
   supabase functions deploy send-invitation
   supabase functions deploy delete-account
   supabase secrets set RESEND_API_KEY=... INVITE_FROM_EMAIL="Family Finance <invites@yourdomain.com>" \
     INVITE_BASE_URL=https://yourdomain.com
   ```
4. Dashboard → Auth:
   * URL Configuration: site URL `familyfinance://`, redirect URLs
     `familyfinance://auth-callback`, `familyfinance://sign-in`.
   * Providers: enable Email (keep "Confirm email" on), Google and Apple
     (see SETUP.md).
   * Sessions: consider a refresh-token reuse interval of 10 s and enable
     leaked-password protection.
5. Storage buckets (`receipts`, `statements`, `documents`) and their policies
   are created by the migrations.

## Mobile app (EAS)

Configuration lives in `apps/mobile/app.config.ts` and `apps/mobile/eas.json`.
Change `ios.bundleIdentifier` / `android.package` (`com.familyfinance.app`) to
identifiers you own before the first build.

```bash
cd apps/mobile
npm install -g eas-cli          # or: npx eas-cli@latest <command>
eas login
eas init                        # links the project and writes EAS_PROJECT_ID
```

Set the public runtime configuration for each environment (EAS → Project →
Environment variables, or in `eas.json` → `build.<profile>.env`):

| Variable | Value |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | the project's anon/publishable key |
| `EXPO_PUBLIC_INVITE_BASE_URL` | optional https base for invite links |

Never put the service-role key in the app.

### Android

```bash
eas build --platform android --profile development   # dev client (APK) for daily development
eas build --platform android --profile preview       # installable APK for testers
eas build --platform android --profile production    # AAB for Google Play
eas submit --platform android                        # upload to Play Console
```

Local alternative (Android Studio + SDK installed): `npx expo run:android`.

### iOS

```bash
eas build --platform ios --profile development       # dev client (needs registered devices)
eas build --platform ios --profile preview           # ad-hoc build for testers
eas build --platform ios --profile production        # App Store build
eas submit --platform ios                            # upload to App Store Connect / TestFlight
```

EAS manages certificates and provisioning profiles. Enable the *Sign in with
Apple* capability for the bundle id (the `usesAppleSignIn` flag in
`app.config.ts` adds the entitlement). Local alternative (macOS + Xcode):
`npx expo run:ios`.

### Over-the-air updates

JavaScript-only changes can ship with `eas update --channel production`.
Anything that adds a native module needs a new build.

## Release checklist

- [ ] `npm run test:core && npm run test:db && npm run test:mobile`
- [ ] `npm run typecheck && npm run lint`
- [ ] Migrations reviewed (locks, backfills) and applied to staging first
- [ ] `npm run db:types` regenerated and committed
- [ ] Manual pass on one Android and one iOS device: sign-up, create family,
      invite spouse (second device), add expense/income/transfer, offline add,
      dashboard numbers match the transactions list
- [ ] STATUS.md updated

## App icon and splash

The icon set in `apps/mobile/assets` is generated from the vector source
`apps/mobile/assets/brand/mark.svg` (a home whose interior is a rising bar
chart, on the brand indigo). After editing the SVG:

```bash
npm i -D playwright && npx playwright install chromium   # once
node scripts/render-icons.mjs
```

This writes `icon.png` (iOS/default, opaque 1024²), the Android adaptive
`android-icon-{foreground,background,monochrome}.png` (mark inside the 66 %
safe zone, monochrome for Android 13 themed icons), `splash-icon.png` and
`favicon.png`. The in-app logo (`components/ui/BrandMark.tsx`) uses the same
geometry. Icons only change in a new native build, not via `eas update`.
