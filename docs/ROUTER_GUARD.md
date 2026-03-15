# Router Guard Implementation

RimRun uses **layout-based router guards** to protect routes based on authentication state. Guards run in layout components and redirect users before they reach protected screens.

## Where Guards Live

| File | Purpose |
|------|---------|
| `app/index.tsx` | Entry guard: redirects to `/(app)` if logged in, `/(auth)/login` if not |
| `app/(app)/_layout.tsx` | App guard: redirects to login if user is not authenticated |
| `app/(auth)/_layout.tsx` | Auth guard: redirects logged-in users away from login/signup; blocks unauthenticated access to onboarding |

## How It Works (Step by Step)

### 1. **Entry point (`app/index.tsx`)**
- On app load, the index screen runs first.
- It reads `user` and `loading` from `useAuth()`.
- While `loading` is true, it shows a loading spinner (we don't know auth state yet).
- Once loading is done: if `user` exists → redirect to `/(app)`; otherwise → redirect to `/(auth)/login`.
- **Why:** Ensures users land on the right flow immediately.

### 2. **App layout guard (`app/(app)/_layout.tsx`)**
- Wraps all app screens (profile, courts, chats).
- If `loading` → show spinner.
- If `!user` (and not loading) → `<Redirect href="/(auth)/login" />`.
- Otherwise → render the Stack (tabs, etc.).
- **Why:** Prevents unauthenticated users from reaching app screens (e.g. via deep link or manual URL).

### 3. **Auth layout guard (`app/(auth)/_layout.tsx`)**
- Wraps login, signup, onboarding, reset-password.
- Uses `useSegments()` to know the current route (e.g. `['(auth)', 'login']`).
- **Redirect to app:** If user is logged in and on login/signup/reset-password → redirect to `/(app)`.
- **Allow onboarding:** If user is on onboarding, do not redirect (they may be completing it after signup).
- **Redirect to login:** If user is not logged in and on onboarding → redirect to login (onboarding requires auth).
- **Why:** Logged-in users should not see login/signup; onboarding should only be reachable when authenticated.

## Flow Diagram

```
App Start
    │
    ▼
index.tsx ──loading──► Spinner
    │
    ├── user? ──yes──► /(app)
    │
    └── user? ──no───► /(auth)/login
                            │
                            ├── (app)/_layout: !user? ──yes──► /(auth)/login
                            │
                            └── (auth)/_layout: user on login/signup? ──yes──► /(app)
```

## Why Layout-Based Guards?

- **Centralized:** One place per route group to enforce rules.
- **Early redirect:** Redirects happen in the layout before child screens render.
- **Expo Router pattern:** Uses `Redirect` and `useSegments()` as intended by Expo Router.
- **No prop drilling:** Auth state comes from `useAuth()`; no need to pass it down.
