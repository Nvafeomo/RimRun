# RimRun

A mobile app for finding pickup basketball: browse courts on a map, save the spots you care about, and coordinate with other players through DMs and court chats. I built RimRun mostly because I play basketball in my free time. I keep shoes and a ball in the trunk in case I stop by a court during the week. The app helps me and other users find nearby courts and communities, and it gave me a reason to practice shipping a full product on real devices, not just tutorials. Along the way I wired up auth, maps, chat, and a Postgres backend with row-level security, plus age-based rules so social features stay consistent from the database down to the UI.

## What it does

- **Courts:** Map and search, subscribe to courts, and add new ones (address-only vs location flows depend on age, matching how the product handles minors.)
- **Profile:** Username, optional photo, privacy toggles, and date of birth so age rules can be enforced server-side.
- **Social:** Friends, direct messages, group chats, and threads tied to a court. Direct chats and court threads follow different visibility rules on purpose.
- **Auth:** Email and password, Google sign-in through Supabase, and password reset via deep link.

## Stack

**Expo 54 · React 19 · TypeScript · Expo Router · Supabase (Auth, Postgres, Storage) · react-native-maps · NativeWind (Tailwind) · Google sign-in**

## Run locally

You will need Node.js (LTS), npm, and a [Supabase](https://supabase.com) project. The quickest way to try the app is [Expo Go](https://expo.dev/go) on a phone; use Android Studio or Xcode if you want a full native build.

```bash
npm install --legacy-peer-deps
```

Add a `.env` in the project root with your Supabase values (keep real keys out of git):

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Restart the dev server after editing env vars.

```bash
npm start
```

Then press `a` / `i` / `w` for Android, iOS, or web, or scan the QR code in Expo Go.

**Android tip:** If you see `Failed to download remote update`, the phone cannot reach Metro on your machine. Try `npm run start:tunnel`, use the same Wi‑Fi as your computer (VPN off if possible), or allow Node through the firewall on port **8081**. Match Expo Go to **SDK 54**.

Native dev builds: `npm run android` · `npm run ios` · `npm run web`

## Backend notes

The app talks to **Supabase** (Postgres with RLS). Migration-style SQL lives under `scripts/` (policies, RPCs, triggers). You will need to apply whatever subset matches how you run the project: for example, friend and DM age checks, and how messages show up in court threads versus private chat. The client mirrors part of that logic in `lib/agePolicy.ts` and should stay in sync with what you deploy.

Only the **anon** key belongs in the client. Never ship the **service role** key in an app build. Using different Supabase projects or keys for dev and production helps avoid accidents.

## Future features

Stronger moderation and reporting, analytics or charts for usage, automated tests, and a dedicated dev Supabase once a production instance is live.

## Author

**Nvafeomo K. Konneh**

- **Email:** [nvafeomo05@gmail.com](mailto:nvafeomo05@gmail.com)
- **Phone:** 267-461-8268
- **LinkedIn:** [Nvafeomo Konneh](https://www.linkedin.com/in/nvafeomo-konneh-a6a1a9367)

## License

Proprietary. [All rights reserved](LICENSE). Not licensed for copying or redistribution without written permission. Update the copyright line in `LICENSE` to your legal name if you use one.
