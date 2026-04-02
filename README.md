# RimRun

Cross-platform mobile app for discovering basketball courts on a map, managing a profile, and connecting with other players. Built with Expo and React Native; backend is Supabase (auth, Postgres, storage).

## Stack

Expo 54 · React 19 · TypeScript · Expo Router · Supabase · react-native-maps · NativeWind (Tailwind) · Google sign-in (OAuth via Supabase)

## Getting started

**Requirements:** Node.js (LTS), npm, and a [Supabase](https://supabase.com) project. Use [Expo Go](https://expo.dev/go) on a device for the quickest loop, or run Android Studio / Xcode if you prefer native builds.

Clone the repo, open a terminal in the project folder, then:

```bash
npm install --legacy-peer-deps
```

Create `.env` in the project root:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Restart the dev server after changing env vars.

```bash
npm start
```

Then press `a` / `i` / `w` for Android, iOS, or web, or scan the QR code with Expo Go.

**If Expo Go on Android fails with `Failed to download remote update`:** the phone can’t reach Metro on your machine. Try `npm run start:tunnel`, put phone and PC on the same Wi‑Fi (no VPN if possible), or allow Node through Windows Firewall on port 8081. Match Expo Go’s version to SDK 54.

Native builds: `npm run android` · `npm run web`

## Repo layout

| Path | Purpose |
|------|---------|
| `app/` | Expo Router screens and navigation |
| `lib/` | Supabase client, OAuth, domain helpers |
| `context/` | Auth and profile providers |
| `scripts/` | Court import/geocode utilities — see `scripts/README.md` |
| `supabase/` | Edge functions and SQL migrations (where present) |

## Database and safety

Age-related rules for DMs and friend requests are enforced in app code (`lib/agePolicy.ts`) and in Supabase RPCs/migrations. Apply the SQL in order (Phase 0/1 → Phase 2 → Phase 2b as needed); consolidated scripts live under `scripts/` with notes in `docs/` where applicable.

## Docs

- Privacy policy (hosted copy): `docs/privacy-policy.html`
- Implementation checklists and deeper notes: `docs/` (e.g. `IMPLEMENTATION_STATUS.md` if present)

## License

Proprietary — [all rights reserved](LICENSE). Not licensed for copying or redistribution without written permission. Update the copyright line in `LICENSE` to your legal name if you use one.
