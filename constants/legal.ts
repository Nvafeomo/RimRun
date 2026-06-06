/**
 * Hosted legal pages (GitHub Pages). Override in `.env`:
 * EXPO_PUBLIC_PRIVACY_POLICY_URL=https://...
 * EXPO_PUBLIC_TERMS_OF_SERVICE_URL=https://...
 */
export const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ??
  'https://nvafeomo.github.io/RimRun/privacy/privacy-policy.html';

export const TERMS_OF_SERVICE_URL =
  process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL ??
  'https://nvafeomo.github.io/RimRun/termsofservice/';

/** Marketing / waitlist site (GitHub Pages `docs/`). */
export const LANDING_PAGE_URL =
  process.env.EXPO_PUBLIC_LANDING_PAGE_URL ?? 'https://nvafeomo.github.io/RimRun/';
