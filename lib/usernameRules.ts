/** Shared username rules — keep in sync with `scripts/username-enforcement.sql`. */

export const USERNAME_MIN_LENGTH = 6;
export const USERNAME_MAX_LENGTH = 20;

/** Canonical form: trimmed, lowercase (stored in DB). */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

const USERNAME_PATTERN = /^[a-z0-9_]+$/;

const RESERVED_USERNAMES = new Set<string>([
  'admin',
  'administrator',
  'moderator',
  'mod',
  'support',
  'help',
  'rimrun',
  'official',
  'system',
  'staff',
  'team',
  'null',
  'undefined',
  'root',
  'api',
  'www',
  'mail',
  'security',
  'bot',
  'owner',
  'rimrunapp',
]);

/**
 * Validates canonical username (already trimmed + lowercased).
 * Returns `null` if valid, otherwise a short user-facing error string.
 */
export function validateUsernameFormat(canonical: string): string | null {
  if (!canonical) return 'Username is required';
  if (
    canonical.length < USERNAME_MIN_LENGTH ||
    canonical.length > USERNAME_MAX_LENGTH
  ) {
    return `Username must be ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters`;
  }
  if (!USERNAME_PATTERN.test(canonical)) {
    return 'Use letters, numbers, and underscores only';
  }
  if (RESERVED_USERNAMES.has(canonical)) {
    return 'This username is reserved. Choose another.';
  }
  return null;
}

/** Validate raw input from a field (applies normalization first). */
export function validateUsernameInput(raw: string): string | null {
  return validateUsernameFormat(normalizeUsername(raw));
}

export const USERNAME_RULES_USER_HINT = `${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters, letters, numbers, underscore only`;

export function isPostgresUniqueViolation(
  err: { code?: string } | null | undefined,
): boolean {
  return err?.code === '23505';
}

/**
 * Friendly message for profile insert/update failures (unique username, trigger rules).
 */
export function mapProfileUsernameError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: string }).code;
    if (code === '23505') {
      return 'Username is already taken.';
    }
  }
  const msg =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message)
      : '';
  const lower = msg.toLowerCase();
  if (lower.includes('reserved_username') || lower.includes('reserved username')) {
    return 'This username is reserved. Choose another.';
  }
  if (lower.includes('username_invalid_length')) {
    return `Username must be ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters.`;
  }
  if (lower.includes('username_invalid_charset')) {
    return 'Use letters, numbers, and underscores only.';
  }
  if (msg) return msg;
  return 'Could not save profile.';
}
