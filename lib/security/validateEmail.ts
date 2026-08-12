const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmailAddress(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Email is required';
  if (trimmed.length > 254) return 'Invalid email address';
  if (!EMAIL_REGEX.test(trimmed)) return 'Invalid email address';
  return null;
}

/** Login field accepts username or email. */
export function validateEmailOrUsername(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Email or Username is required';
  if (trimmed.includes('@')) {
    return validateEmailAddress(trimmed);
  }
  return null;
}
