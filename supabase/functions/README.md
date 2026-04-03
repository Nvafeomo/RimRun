# RimRun Edge Functions

## delete-account

Allows authenticated users to permanently delete their own account. Uses the service role server-side to delete from `auth.users` (related rows in `public` are removed via FK `ON DELETE CASCADE` where configured).

The app calls `supabase.functions.invoke('delete-account', { headers: { Authorization: \`Bearer ${accessToken}\` } })` from `app/(app)/(tabs)/profile.tsx`.

### Required secrets (hosted Supabase)

The function reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` automatically. For **`auth.admin.deleteUser`** you must supply the **service role** key:

| Where | Secret name | Notes |
|--------|-------------|--------|
| **CLI** (`supabase secrets set`) | **`SERVICE_ROLE_KEY`** | Names starting with `SUPABASE_` are **reserved** — the CLI will skip them (`Env name cannot start with SUPABASE_`). |
| **Dashboard** (Edge Function secrets) | `SERVICE_ROLE_KEY` **or** `SUPABASE_SERVICE_ROLE_KEY` | Either works; the function checks **`SERVICE_ROLE_KEY` first**, then `SUPABASE_SERVICE_ROLE_KEY`. |

**CLI (project linked):**

```bash
npx supabase secrets set SERVICE_ROLE_KEY=paste_service_role_key_here
```

Use the **service_role** value from **Project Settings → API** (never commit it; never put it in the Expo app).

Redeploy the function after changing secrets if needed:

`npx supabase functions deploy delete-account`

### One-time: link CLI to the right project

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

`YOUR_PROJECT_REF` is the id in your Supabase URL: `https://YOUR_PROJECT_REF.supabase.co`.

### Deploy to production

```bash
supabase functions deploy delete-account
```

Confirm **Supabase Dashboard → Edge Functions** lists `delete-account` and shows a recent deployment.

List functions (with CLI linked to prod):

```bash
supabase functions list
```

### Verify it works (production)

1. **Happy path (in app)**  
   Use a **throwaway** account on the **production** API URL (same `EXPO_PUBLIC_SUPABASE_URL` as your release build). **Profile → Delete account** → you should be signed out and unable to sign in again with that email/username.

2. **Confirm user is gone**  
   **Dashboard → Authentication → Users** — user row removed.  
   Or SQL (service role / SQL editor with access): no row in `auth.users` for that id.

3. **curl (no app rebuild)**  
   Get a **user** `access_token` (e.g. sign in via app and log token in dev, or use Auth API). Then:

   ```bash
   curl -sS -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/delete-account" \
     -H "Authorization: Bearer USER_ACCESS_TOKEN" \
     -H "apikey: YOUR_ANON_KEY" \
     -H "Content-Type: application/json"
   ```

   Expect JSON `{"success":true}` and HTTP **200**.  
   `401` = missing/invalid JWT. **500** (`Server misconfigured` or admin error) often means **`SERVICE_ROLE_KEY`** is missing or wrong in Edge secrets.

4. **“Wrong URL” sanity check**  
   Point a dev build at a **fake** project URL (or typo the ref) and invoke delete — the call should **fail** (network error or 4xx), not succeed. Confirms you are not accidentally hitting a different environment.

### Troubleshooting (non-2xx from the app)

The app now surfaces the JSON `error` string from the function (not only “Edge Function returned a non-2xx status code”).

| Symptom / message | Likely cause |
|-------------------|----------------|
| **Server misconfigured** | `SERVICE_ROLE_KEY` secret missing — set it and redeploy. |
| **Invalid API key** (from delete) | Almost always **wrong `SERVICE_ROLE_KEY`** in **Edge Function secrets** (anon key pasted by mistake, typo, old key after rotate, extra quotes). **App `.env` is not used** for `auth.admin.deleteUser`. Copy **service_role** from **Dashboard → Settings → API** into **Edge Functions → Secrets** as `SERVICE_ROLE_KEY`, then redeploy. |
| **Unauthorized** | Missing/invalid JWT — sign in again; ensure `Authorization: Bearer <access_token>` is sent. |
| **HTTP 404** | Function not deployed or wrong project URL in the app. |
| **Message from `auth.admin.deleteUser`** | Rare; check Supabase Auth logs. |

### Local development

```bash
supabase functions serve delete-account
```

For local serve you typically need `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SERVICE_ROLE_KEY` (see Supabase CLI docs for Edge local secrets).
