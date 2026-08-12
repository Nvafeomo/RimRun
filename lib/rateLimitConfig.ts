/** Client-side rate limits (AsyncStorage). Server limits may also apply. */
export const RATE_LIMITS = {
  auth: {
    /** Failed sign-in attempts per identifier (email/username). */
    signIn: { maxAttempts: 5, windowMs: 15 * 60 * 1000 },
    signUp: { maxAttempts: 3, windowMs: 60 * 60 * 1000 },
    passwordReset: { maxAttempts: 3, windowMs: 60 * 60 * 1000 },
    oauth: { maxAttempts: 10, windowMs: 15 * 60 * 1000 },
  },
  social: {
    friendRequest: { maxAttempts: 20, windowMs: 60 * 60 * 1000 },
    blockUser: { maxAttempts: 30, windowMs: 60 * 60 * 1000 },
  },
  reports: { maxAttempts: 10, windowMs: 24 * 60 * 60 * 1000 },
  moderation: {
    banAppeal: { maxAttempts: 3, windowMs: 24 * 60 * 60 * 1000 },
  },
  chat: {
    /** Max messages sent per conversation per rolling window. */
    sendMessage: { maxAttempts: 30, windowMs: 60 * 1000 },
    /** Minimum ms between sends in the same conversation. */
    minIntervalMs: 500,
  },
} as const;
