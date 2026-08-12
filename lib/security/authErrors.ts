import { RateLimitError, mapExternalRateLimitError } from '../rateLimit';

export const INVALID_CREDENTIALS = 'Invalid credentials';

const SIGN_IN_GENERIC_PATTERNS =
  /invalid credentials|invalid login|invalid email or password|email not confirmed|user not found|no user|wrong password|invalid password/i;

const SIGN_UP_GENERIC_PATTERNS =
  /already registered|already exists|user already|duplicate key|email address is already/i;

/** Map Supabase auth errors to generic user-facing messages (no account enumeration). */
export function mapSignInError(error: unknown): Error {
  if (error instanceof RateLimitError) return error;
  if (error instanceof Error && error.message === INVALID_CREDENTIALS) {
    return error;
  }
  const mapped = mapExternalRateLimitError(error);
  if (mapped.message !== (error instanceof Error ? error.message : String(error ?? ''))) {
    return mapped;
  }
  const msg = error instanceof Error ? error.message : String(error ?? '');
  if (SIGN_IN_GENERIC_PATTERNS.test(msg) || !msg.trim()) {
    return new Error(INVALID_CREDENTIALS);
  }
  return new Error(INVALID_CREDENTIALS);
}

export function mapSignUpError(error: unknown): Error {
  if (error instanceof RateLimitError) return error;
  const mapped = mapExternalRateLimitError(error);
  if (mapped.message !== (error instanceof Error ? error.message : String(error ?? ''))) {
    return mapped;
  }
  const msg = error instanceof Error ? error.message : String(error ?? '');
  if (SIGN_UP_GENERIC_PATTERNS.test(msg)) {
    return new Error(
      'Unable to create account. Try signing in or use a different email.',
    );
  }
  return error instanceof Error ? error : new Error(msg || 'Sign up failed');
}

export function mapPasswordResetError(error: unknown): Error {
  if (error instanceof RateLimitError) return error;
  const mapped = mapExternalRateLimitError(error);
  if (mapped.message !== (error instanceof Error ? error.message : String(error ?? ''))) {
    return mapped;
  }
  return new Error(
    'If an account exists for that email, a reset link will be sent shortly.',
  );
}
