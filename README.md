# RimRun

Cross-platform mobile app for discovering basketball courts on a map, managing a profile, and connecting with other players (friends, DMs, court chats). I built it to ship a real-world Expo + Supabase app with location, chat, and age-aware social rules.

## Features

- **Courts** — Map discovery, search, subscriptions, user-submitted courts (address / location by age rules)
- **Profile** — Username, photo (with privacy settings), date of birth for age-based rules
- **Social** — Friends, direct messages, group chats, court-associated threads (DM rules vs court visibility differ)
- **Auth** — Email/password and Google sign-in (Supabase); password reset via deep link

## Stack

**Expo 54 · React 19 · TypeScript · Expo Router · Supabase (Auth, Postgres, Storage) · react-native-maps · NativeWind (Tailwind) · Google sign-in**

## Run locally

**Requirements:** Node.js (LTS), npm, and a [Supabase](https://supabase.com) project. [Expo Go](https://expo.dev/go) is the fastest way to test on a device; use Android Studio / Xcode for native builds if you prefer.

```bash
npm install --legacy-peer-deps
```

Create `.env` in the project root (do not commit real keys):

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Restart the dev server after changing env vars.

```bash
npm start
```

Press `a` / `i` / `w` for Android, iOS, or web, or scan the QR code with Expo Go.

**If Expo Go on Android shows `Failed to download remote update`:** the device can’t reach Metro. Try `npm run start:tunnel`, use the same Wi‑Fi as your PC (avoid VPN if possible), or allow Node through the firewall on port **8081**. Match Expo Go’s version to **SDK 54**.

Native dev builds: `npm run android` · `npm run ios` · `npm run web`

## Deploy (e.g. EAS + stores)

Ship **release builds** with a production Supabase project (or a clearly designated prod environment). Use **EAS** (`eas build`) and set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in **EAS secrets** (or your CI env)—not by committing `.env` to git. Local `.env` stays gitignored for development.

Configure **Supabase Auth** redirect URLs and **Google OAuth** for production (`rimrun://` scheme, Play/App signing SHA, bundle ID)—see `docs/auth-deployment-checklist.md`. Submit binaries through **App Store Connect** and **Google Play** with your Privacy Policy and Terms URLs.

## Backend & Supabase

Data lives in **Supabase** (Postgres + RLS), not in the repo. SQL under `scripts/` defines policies, RPCs, and triggers—**apply the migrations your project needs** to match the app (age rules for friends/DMs, message visibility for court threads, etc.). Client checks in `lib/agePolicy.ts` should stay aligned with the SQL functions you deploy.

The **anon** key is expected in the client bundle; protect **service role** keys and never embed them in the app. Use separate Supabase projects or keys for dev vs production when possible.

## Docs

- **Privacy policy:** `docs/privacy/privacy-policy.md` → run `npm run sync-privacy-policy` to regenerate `constants/privacyPolicyMarkdown.ts` for the in-app screen. Store-ready HTML: `docs/privacy/privacy-policy.html`.
- **Auth & deep links:** `docs/auth-deployment-checklist.md`
- **Implementation / policy notes:** `docs/personal/` (e.g. age & chat policy drafts)

## Ideas

Auth-hardening, richer moderation/reporting, charts/analytics, tests, separate dev Supabase after prod launch.

## Author

**Nvafeomo K. Konneh**

## License

Proprietary — [all rights reserved](LICENSE). Not licensed for copying or redistribution without written permission. Update the copyright line in `LICENSE` to your legal name if you use one.
