# RimRun landing page setup

The marketing site lives under `docs/` and deploys with **GitHub Pages** (same as privacy / terms).

| Page | URL (after push) |
|------|------------------|
| Home | `https://nvafeomo.github.io/RimRun/` |
| Demos (full page) | `.../Demo/Screenshots/demo.html` |
| Android testing | `.../android-testing.html` |
| iOS testing | `.../ios-testing.html` |

## Email signup (pick one)

The form on the home page posts to whatever you set in `docs/site-config.js` → `formEndpoint`.

### Option A — Formspree (fastest, free tier)

1. Sign up at [formspree.io](https://formspree.io).
2. Create a form; copy the endpoint (`https://formspree.io/f/xxxxx`).
3. Set in `docs/site-config.js`:
   ```js
   formEndpoint: 'https://formspree.io/f/xxxxx',
   ```
4. In Formspree, enable fields: `email`, `pre_release_updates`, `release_waitlist`.

You’ll get an email per signup. Export CSV or upgrade for automations.

### Option B — Loops.so (built for product waitlists)

1. Create audience + two contact properties: `preRelease`, `releaseWaitlist`.
2. Use their [API](https://loops.so/docs/api-reference) from a tiny serverless function, **or** use Formspree → Zapier → Loops until you add an API route.
3. Good when you want segmented campaigns (“beta update #2” vs “app is live”).

### Option C — Supabase (you already use it)

1. Table `waitlist_signups (email, pre_release boolean, release_waitlist boolean, created_at)`.
2. RLS: allow `insert` for `anon` only (no public read), or hide behind an Edge Function.
3. Point `formEndpoint` at the function URL or use Supabase REST with anon key + strict RLS.

Most control; you send mail yourself (Resend, etc.) later.

## Assets

- Logo on Pages: `docs/assets/rimrun-logo.png` (copied from `assets/rimrun-logo.png`). Re-copy after logo changes:
  ```powershell
  Copy-Item assets\rimrun-logo.png docs\assets\rimrun-logo.png -Force
  ```
- Demos: GIFs in `docs/Demo/Screenshots/` (already referenced).

## Tester invite links

When Play Internal Testing or TestFlight is ready, edit:

- `docs/android-testing.html` — replace `ANDROID_TEST_LINK_PLACEHOLDER`
- `docs/ios-testing.html` — replace `IOS_TEST_LINK_PLACEHOLDER`

## Deploy

Push to the branch GitHub Pages uses (`main`, folder `/docs`). No build step.
