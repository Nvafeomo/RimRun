# Auth & deep links — deployment checklist

## Supabase → Authentication → URL configuration

| URL | Purpose |
|-----|---------|
| `exp://…` | **Expo Go** — copy the exact `redirectTo` from the Metro log (`[OAuth] redirectTo…`). Add every host/port variant you use (LAN IP changes). |
| `rimrun://auth/callback` | Google OAuth on **development / production builds** (`lib/oauth.ts`) |
| `rimrun://reset-password` | Password reset email redirect (`lib/authRedirects.ts`) |
| `rimrun://` | Optional default / Site URL |

**Do not rely on `https://auth.expo.io/...` for Supabase PKCE** — Expo’s legacy auth proxy often shows “Something went wrong trying to finish signing in.” Prefer **`exp://`** + allow list above, or a **development build** with `rimrun://` ([Expo auth proxy migration](https://github.com/expo/fyi/blob/main/auth-proxy-migration.md)).

**Site URL:** Often `rimrun://` for a mobile-only app; can be your HTTPS marketing URL if you prefer it in email templates.

### Local setup (Expo Go + Google OAuth)

1. Restart Metro, trigger Google sign-in once, and copy **`[OAuth] redirectTo`** from the log (usually `exp://YOUR_LAN_IP:8081/--/auth/callback`).

2. **Supabase** → **Authentication** → **URL Configuration** → **Redirect URLs** → add that **exact** string. Remove **`https://auth.expo.io/...`** if you previously added it and saw the proxy error page.

3. For a **stable** Expo Go URL, run `npx expo start --tunnel` and add the new `exp://…` line from the log.

4. For **production-like** OAuth, use a **development build** (`expo-dev-client`) and `rimrun://auth/callback` only.

## Google Cloud Console

- **OAuth consent screen:** Publish to **Production** when you need testers outside the allowed test-user list.
- **Android:** Release **SHA-1** / SHA-256 from **Play App Signing** (not only your local debug keystore) on the Android OAuth client used by Supabase / the app.
- **iOS:** Use the correct **Bundle ID** (`com.nvafeomo.RimRun` in `app.json`) for the iOS OAuth client.

## In-app behavior (this repo)

- **Google sign-in:** `WebBrowser` + Supabase `signInWithOAuth`; redirect is `exp://…` in Expo Go or `rimrun://auth/callback` in dev/release builds.
- **Password reset:** Email link → `rimrun://reset-password` → `AuthContext` applies tokens from the deep link → user is sent to **Reset password** to choose a new password → `clearPendingPasswordRecovery` on success.

After changing redirect URLs, rebuild release binaries (native URL handling is baked into the build with your scheme).
