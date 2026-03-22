# RimRun

A mobile app for finding basketball courts on a map, built with [Expo](https://expo.dev) and [React Native](https://reactnative.dev). It uses [Supabase](https://supabase.com) for authentication and backend data.

## Prerequisites

- **Node.js** (LTS recommended) and **npm**
- **Expo Go** on a physical device, or an emulator/simulator with **Android Studio** / **Xcode** for native builds
- A **Supabase** project with URL and anon key

## Setup

1. Clone the repo and install dependencies:

   ```bash
   npm install
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
