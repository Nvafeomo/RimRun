export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_POLICY_HINT = `At least ${PASSWORD_MIN_LENGTH} characters`;

/** Sign-up, password change, and password reset. */
export function validatePasswordForSignup(value: string): string | null {
  if (!value) return 'Password is required';
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  return null;
}

/** Login — only require non-empty; do not enforce signup rules on existing accounts. */
export function validatePasswordForLogin(value: string): string | null {
  if (!value.trim()) return 'Password is required';
  if (value.length > PASSWORD_MAX_LENGTH) return 'Invalid credentials';
  return null;
}
