# RimRun

A mobile app for finding basketball courts on a map, built with [Expo](https://expo.dev) and [React Native](https://reactnative.dev). It uses [Supabase](https://supabase.com) for authentication and backend data.

## What to install

| What | How |
|------|-----|
| **Node.js** (includes **npm**) | Download from [nodejs.org](https://nodejs.org) (LTS recommended). Needed for all terminal commands below. |
| **Git** | Optional: [git-scm.com](https://git-scm.com) if you clone the repo with `git clone`. |
| **Expo Go** | Install from the [App Store](https://apps.apple.com) or [Google Play](https://play.google.com/store) to run the app on a physical phone. |
| **Android Studio** (Windows / Linux) or **Xcode** (macOS, iOS only) | Only if you use `npm run android` / `npm run ios` instead of Expo Go. Download from [developer.android.com/studio](https://developer.android.com/studio) or the Mac App Store / Apple developer tools. |

**Supabase** is hosted in the cloud: create a free project at [supabase.com](https://supabase.com) and copy the project URL and anon key (no local Supabase install required for normal app use).

## Prerequisites (summary)

- Node.js + npm on your machine
- For phone testing: Expo Go on the device (same Wi‑Fi as your computer, or use tunnel in Expo)
- A Supabase project and `.env` values (see Setup)
- For native builds only: Android Studio and/or Xcode as above

## Setup

1. Clone or download the repo, then install dependencies. This project expects **legacy peer dependency resolution** so installs succeed:

   ```bash
   npm install --legacy-peer-deps
   ```

2. Create a `.env` file in the project root:

   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

   The app reads these at build time; restart the dev server after changing them.

## Run

```bash
npm start
```

Then press `a` (Android), `i` (iOS), or `w` (web), or scan the QR code with Expo Go.

### Expo Go on Android: `java.io.IOException: Failed to download remote update`

Expo Go is failing to download the JavaScript bundle from your dev machine (network path to Metro), not from your app source code. Try, in order:

1. **`npm run start:tunnel`** — uses Expo’s tunnel so the phone does not need to reach your PC’s LAN IP (works across Wi‑Fi isolation, many corporate networks, and some VPNs).
2. **Same Wi‑Fi** — phone and PC on the same network; turn off VPN on both if possible.
3. **Windows Firewall** — allow **Node.js** (or inbound **TCP 8081**) on **Private** networks; set the Wi‑Fi profile to Private, not Public.
4. **Expo Go vs SDK** — install the latest **Expo Go** from the Play Store so it matches **Expo SDK 54** (this project).

After switching to tunnel or fixing the network, fully close Expo Go and scan the new QR code (or enter the URL manually).

- **Android / iOS (native):** `npm run android` or `npm run ios` (requires local SDKs and configured devices/emulators)
- **Web:** `npm run web`

## Supabase: Phase 2 age policy

Run `scripts/phase-2-age-policy.sql` in the **Supabase SQL Editor** after Phase 0/1 and chat/friend migrations are applied (or run the Phase 2 block inside `scripts/rimrun-consolidated-migrations.sql`). It enforces the same rules as `lib/agePolicy.ts` for DMs, accepting friend requests, and **sending** friend requests.

**Sanity checks in SQL Editor** (no auth needed):

```sql
SELECT public.mutual_interaction_allowed(14, 14);  -- expect true
SELECT public.mutual_interaction_allowed(14, 25);  -- expect false
SELECT public.age_in_full_years('2010-06-15'::date, CURRENT_DATE);
```

`get_or_create_dm_conversation`, `accept_friend_request`, and inserts on `friend_requests` raise clear exceptions if ages are missing or the pair is not allowed. The app shows the server `message` in alerts.

Testing those RPCs **as a real user** needs a JWT (`auth.uid()`): use the RimRun app, or Supabase tools that impersonate a user. You cannot fully exercise `auth.uid()`-based RPCs from the SQL Editor alone without extra setup.

**Phase 2b** (court message pairwise visibility, lock DOB updates, minors’ court address): run `scripts/phase-2b-messages-visibility.sql` after Phase 2 age functions exist, or use the Phase 2b section inside `scripts/rimrun-consolidated-migrations.sql`. See `docs/IMPLEMENTATION_STATUS.md` for the full checklist.

## Optional scripts

Court data utilities (see `scripts/README.md`):

- `npm run import-courts` — import court data
- `npm run geocode-courts` — geocode courts (needs extra env vars for admin access)

## Stack (high level)

Expo ~54, React 19, React Native, Expo Router, Supabase JS, React Native Maps, NativeWind (Tailwind).
