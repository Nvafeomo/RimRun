# RimRun — local development

This guide covers running RimRun on your machine, env setup, Metro networking issues, and backend notes. For a product overview, see the root [README](../README.md).

## Prerequisites

- Node.js (LTS)
- npm
- A [Supabase](https://supabase.com) project
- [Expo Go](https://expo.dev/go) for the quickest device preview, or Android Studio / Xcode for full native builds

Match Expo Go to **SDK 54**.

## Install and run

```bash
npm install --legacy-peer-deps
```

Add a `.env` in the project root with your Supabase and Google values (keep real keys out of git):

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY=your-google-maps-android-api-key
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-ios-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps.your-ios-client-id
```

Restart the dev server after editing env vars.

```bash
npm start
```

Then press `a` / `i` / `w` for Android, iOS, or web, or scan the QR code in Expo Go.

Native dev builds:

```bash
npm run android
npm run ios
npm run web
```

## Android: “Failed to download remote update”

If you see `Failed to download remote update`, the phone cannot reach Metro on your machine. Try:

1. `npm run start:tunnel`
2. Use the same Wi‑Fi as your computer (VPN off if possible)
3. Allow Node through the firewall on port **8081**
4. Confirm Expo Go matches **SDK 54**

## Backend notes

The app talks to **Supabase** (Postgres with RLS). Migration-style SQL lives under `scripts/` (policies, RPCs, triggers). Apply the subset that matches how you run the project — for example, friend and DM age checks, and how messages show up in court threads versus private chat.

The client mirrors part of that logic in `lib/agePolicy.ts` and should stay in sync with what you deploy.

Only the **anon** key belongs in the client. Never ship the **service role** key in an app build. Using different Supabase projects or keys for dev and production helps avoid accidents.

## Related docs

- [Auth deployment checklist](./auth-deployment-checklist.md)
- [Beta testing (EAS / TestFlight / Play)](./TESTING.md)
- [Landing page setup](./LANDING_SETUP.md)
