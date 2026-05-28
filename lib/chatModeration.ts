import { BLOCKED_PHRASES, BLOCKED_TERMS } from './chatModerationTerms';

export type ModerationResult =
  | { blocked: false }
  | { blocked: true; reason: string };

export const MODERATION_DEFAULT_REASON =
  "Your message contains content that isn't allowed here.";

export const MODERATION_SPAM_REASON =
  'Message looks like spam. Please slow down and try again.';

export const MODERATION_CAPS_REASON =
  "Please don't shout. Turn off caps lock.";

/** Leetspeak / spacing normalization before pattern checks. */
export function normalizeForModeration(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[@4]/g, 'a')
    .replace(/[3€]/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/\$/g, 's')
    .replace(/[5$]/g, 's')
    .replace(/[7+]/g, 't')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TERM_PATTERNS = BLOCKED_TERMS.map(
  (term) => new RegExp(`\\b${escapeRegex(term)}\\b`, 'i'),
);

const PHRASE_PATTERNS = BLOCKED_PHRASES.map(
  (phrase) => new RegExp(escapeRegex(phrase).replace(/\s+/g, '\\s+'), 'i'),
);

function matchesAnyPattern(text: string, patterns: RegExp[]): boolean {
  const normalized = normalizeForModeration(text);
  const compact = normalized.replace(/\s/g, '');
  return patterns.some(
    (pattern) => pattern.test(normalized) || pattern.test(compact),
  );
}

function isSpammy(text: string): boolean {
  if (/(.)\1{9,}/.test(text)) {
    return true;
  }
  const trimmed = text.trim();
  if (
    trimmed.length > 20 &&
    trimmed === trimmed.toUpperCase() &&
    /[A-Z]/.test(trimmed)
  ) {
    return true;
  }
  return false;
}

/** Layer 1 — instant client check before any network call. */
export function checkMessageClient(text: string): ModerationResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { blocked: false };
  }

  if (matchesAnyPattern(trimmed, PHRASE_PATTERNS)) {
    return { blocked: true, reason: MODERATION_DEFAULT_REASON };
  }

  if (matchesAnyPattern(trimmed, TERM_PATTERNS)) {
    return { blocked: true, reason: MODERATION_DEFAULT_REASON };
  }

  if (isSpammy(trimmed)) {
    if (/(.)\1{9,}/.test(trimmed)) {
      return { blocked: true, reason: MODERATION_SPAM_REASON };
    }
    return { blocked: true, reason: MODERATION_CAPS_REASON };
  }

  return { blocked: false };
}

/** Parse Postgres trigger / RLS errors from message insert. */
export function parseMessageInsertModerationError(error: {
  message?: string;
  hint?: string;
}): ModerationResult {
  const msg = error.message ?? '';
  const hint = error.hint?.trim();

  if (
    msg.startsWith('BLOCKED:') ||
    /prohibited|not allowed|blocked:/i.test(msg)
  ) {
    if (msg.includes('BLOCKED:spam') || hint?.toLowerCase().includes('spam')) {
      return { blocked: true, reason: MODERATION_SPAM_REASON };
    }
    if (msg.includes('BLOCKED:all_caps') || hint?.toLowerCase().includes('caps')) {
      return { blocked: true, reason: MODERATION_CAPS_REASON };
    }
    return {
      blocked: true,
      reason: hint || MODERATION_DEFAULT_REASON,
    };
  }

  return { blocked: false };
}
