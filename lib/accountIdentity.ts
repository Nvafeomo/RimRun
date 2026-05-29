import type { User } from '@supabase/supabase-js';

/** Apple Hide My Email relay addresses — not shown as the user's contact email in UI. */
export function isApplePrivateRelayEmail(
  email: string | null | undefined,
): boolean {
  if (!email?.trim()) return false;
  return /@privaterelay\.appleid\.com$/i.test(email.trim());
}

/** Email the user can use for contact, password reset, and display (excludes Apple relay). */
export function isUsableContactEmail(
  email: string | null | undefined,
): boolean {
  const trimmed = email?.trim();
  if (!trimmed) return false;
  return !isApplePrivateRelayEmail(trimmed);
}

export function getAuthProviders(user: User | null | undefined): string[] {
  return user?.identities?.map((i) => i.provider) ?? [];
}

/** Signed in via Apple/Google only — no email+password identity yet. */
export function isOAuthOnlyUser(user: User | null | undefined): boolean {
  const providers = getAuthProviders(user);
  if (providers.length === 0) return false;
  return !providers.includes('email');
}

/** Prefer profile email, then auth email, when it is a real contact address. */
export function getDisplayContactEmail(
  user: User | null | undefined,
  profileEmail: string | null | undefined,
): string | null {
  const candidates = [profileEmail, user?.email];
  for (const raw of candidates) {
    if (isUsableContactEmail(raw)) return raw!.trim();
  }
  return null;
}

/** Value for account settings email field (never pre-fill Apple relay). */
export function getAccountSettingsEmailDraft(
  user: User | null | undefined,
  profileEmail: string | null | undefined,
): string {
  return getDisplayContactEmail(user, profileEmail) ?? '';
}
