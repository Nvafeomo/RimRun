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

- **Android / iOS (native):** `npm run android` or `npm run ios` (requires local SDKs and configured devices/emulators)
- **Web:** `npm run web`

## Optional scripts

Court data utilities (see `scripts/README.md`):

- `npm run import-courts` — import court data
- `npm run geocode-courts` — geocode courts (needs extra env vars for admin access)

## Stack (high level)

Expo ~54, React 19, React Native, Expo Router, Supabase JS, React Native Maps, NativeWind (Tailwind).
