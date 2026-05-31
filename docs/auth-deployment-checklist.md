# Auth & deep links — deployment checklist

## Supabase → Authentication → URL configuration

| URL | Purpose |
|-----|---------|
| `rimrun://reset-password` | Password reset email redirect (`lib/authRedirects.ts`) |
| `rimrun://` | Optional default / Site URL |

**Google sign-in** uses **native** Google Sign-In + `signInWithIdToken` — **`rimrun://auth/callback` is not used for Google** anymore.

**Site URL:** Often `rimrun://` for a mobile-only app; can be your HTTPS marketing URL if you prefer it in email templates.

## Google Cloud Console

Create **OAuth 2.0 Client IDs** (same Google Cloud project):

| Type | Used for |
|------|----------|
| **Web application** | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` + Supabase Google provider client ID/secret |
| **iOS** | Bundle ID `com.nvafeomo.RimRun` → `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` + `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` |
| **Android** | Package `com.nvafeomo.RimRun` + **SHA-1** from EAS credentials / Play App Signing |

**OAuth consent screen:** Publish to **Production** when you need testers outside the allowed test-user list.

### iOS URL scheme

From the iOS client ID `123456789-abc.apps.googleusercontent.com`, set:

```env
EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps.123456789-abc
```

### Supabase → Google provider

- Client ID + secret from the **Web** OAuth client
- If native iOS sign-in fails with a **nonce** error, enable **Skip nonce check** for Google (Supabase Auth provider settings)

### EAS environment variables

Add to **preview** and **production** (local `.env` for dev builds):

```bash
eas env:create --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value "....apps.googleusercontent.com" --environment preview --visibility sensitive
eas env:create --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value "....apps.googleusercontent.com" --environment preview --visibility sensitive
eas env:create --name EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME --value "com.googleusercontent.apps...." --environment preview --visibility plaintext
```

Repeat for `--environment production`.

**Rebuild required** after changing Google env vars or `app.config.js` plugin settings.

## Apple

- App ID `com.nvafeomo.RimRun` with **Sign in with Apple**
- Supabase Apple **Client IDs:** `com.nvafeomo.RimRun`

## In-app behavior (this repo)

- **Google sign-in:** Native `@react-native-google-signin/google-signin` → Supabase `signInWithIdToken` (`lib/oauth.ts`). Shows Google account picker (not Supabase in browser).
- **Apple sign-in:** Native `expo-apple-authentication` → `signInWithIdToken`.
- **Password reset:** Email link → `rimrun://reset-password` → `AuthContext` applies tokens → **Reset password** screen.

Native Google Sign-In does **not** work in Expo Go — use an **EAS preview/production build**.
