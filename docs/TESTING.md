# RimRun beta testing (EAS + TestFlight + Play)

Use **Expo Application Services (EAS)** to build installable apps for testers. Expo Go is fine for quick dev work; **Apple Sign In, Google OAuth redirects, and production maps** need a real build.

## Profiles (`eas.json`)

| Profile | Use for |
|---------|---------|
| **development** | Dev client with debugging; internal install link |
| **preview** | Fast internal QA (APK / iOS internal); share EAS install URL |
| **production** | TestFlight + Play Store (auto-increments build numbers) |

## One-time setup

### 1. Install EAS CLI and log in

```bash
npm install -g eas-cli
eas login
```

### 2. Link this project to Expo

From the repo root:

```bash
npm run eas:init
```

This adds `extra.eas.projectId` to `app.json`. Commit that change.

### 3. Add build secrets (production Supabase + Maps)

Do **not** commit `.env`. Set secrets on EAS (repeat for each profile if needed, or use project-wide secrets):

```bash
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR_PROJECT.supabase.co" --type string
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "your-anon-key" --type string
eas secret:create --name EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY --value "your-android-maps-key" --type string
```

List secrets: `eas secret:list`

### 4. Supabase Auth (required for OAuth on builds)

In **Supabase → Authentication → URL configuration → Redirect URLs**, add:

```text
rimrun://auth/callback
```

In **Apple provider → Client IDs**:

```text
com.nvafeomo.RimRun
```

(Remove `host.exp.Exponent` from production-only testing if you no longer use Expo Go for OAuth.)

### 5. Apple Developer

- App ID `com.nvafeomo.RimRun` with **Sign in with Apple**
- EAS will prompt for credentials on first iOS build (or upload certs via `eas credentials`)

### 6. App Store Connect + Play Console

- **iOS:** Create app “RimRun” with bundle ID `com.nvafeomo.RimRun`
- **Android:** Create app with package `com.nvafeomo.RimRun`
- Fill in `eas.json` → `submit.production` with your Apple ID, ASC app ID, team ID, and (Android) service account JSON path when ready to submit

---

## Build commands

```bash
# Internal QA (share link from Expo dashboard)
npm run build:preview:ios
npm run build:preview:android

# TestFlight / Play internal track
npm run build:production:ios
npm run build:production:android
```

After a production iOS build:

```bash
npm run submit:ios
```

Then in **App Store Connect → TestFlight**, add internal testers and install via the TestFlight app.

---

## Recommended test flow

### First build (you)

1. `npm run build:preview:ios` (or production if you want TestFlight immediately)
2. Install on your iPhone from the EAS build page QR/link
3. Run through the checklist below

### Invite testers

| Platform | How |
|----------|-----|
| **iOS** | TestFlight → Internal Testing (up to 100) or External (review) |
| **Android** | Play Console → Internal testing track → add emails → share opt-in link |
| **Quick share** | EAS **preview** build install URL (no store review) |

---

## QA checklist (copy per build)

- [ ] Sign up with email + password → onboarding (DOB, username) → app
- [ ] Sign in with **Apple** → onboarding DOB only if new → profile hides relay email
- [ ] Sign in with **Google** → same
- [ ] Map loads courts near you (location permission)
- [ ] Open court detail → **Open in Maps**
- [ ] Subscribe to court → court chat sends/receives message
- [ ] DM or group chat works
- [ ] Profile → Account → add email (optional) → set password (optional, OAuth only)
- [ ] Profile → Delete account → cannot sign in again
- [ ] Sign out / sign back in

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Google sign-in fails after build | Add `rimrun://auth/callback` to Supabase redirect URLs |
| Apple “Unacceptable audience” | Add `com.nvafeomo.RimRun` to Supabase Apple Client IDs |
| Android map blank | Set `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` EAS secret; restrict key to package `com.nvafeomo.RimRun` |
| Build fails credentials | Run `eas credentials` for the platform |
| OAuth worked in Expo Go, not in build | Expo Go uses `exp://`; builds use `rimrun://` |

---

## Optional: development client

For native debugging with dev tools:

```bash
npm run build:dev:ios
npx expo start --dev-client
```

---

## Support

- [EAS Build docs](https://docs.expo.dev/build/introduction/)
- [EAS Submit / TestFlight](https://docs.expo.dev/submit/introduction/)
- RimRun support: rimrun.support@gmail.com
