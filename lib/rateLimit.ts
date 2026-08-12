import AsyncStorage from '@react-native-async-storage/async-storage';
import { RATE_LIMITS } from './rateLimitConfig';

const STORAGE_PREFIX = 'rimrun:rate:';

type Bucket = {
  count: number;
  windowStart: number;
};

export class RateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(formatRateLimitMessage(retryAfterMs));
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export function formatRateLimitMessage(retryAfterMs: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  if (seconds < 60) {
    return `Too many attempts. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

/** Map Supabase / network rate-limit responses to a friendly message. */
export function mapExternalRateLimitError(error: unknown): Error {
  if (error instanceof RateLimitError) {
    return error;
  }
  const msg = error instanceof Error ? error.message : String(error ?? '');
  if (/rate limit|too many requests|email rate limit exceeded|over_email_send_rate_limit/i.test(msg)) {
    return new Error('Too many attempts. Please wait a few minutes and try again.');
  }
  if (/rate_limit:/i.test(msg)) {
    return new Error(formatRateLimitMessage(60_000));
  }
  return error instanceof Error ? error : new Error(msg || 'Something went wrong');
}

function storageKey(scope: string, identifier: string): string {
  const normalized = identifier.trim().toLowerCase().slice(0, 200) || 'default';
  return `${STORAGE_PREFIX}${scope}:${normalized}`;
}

async function readBucket(key: string): Promise<Bucket | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Bucket;
    if (
      typeof parsed.count !== 'number' ||
      typeof parsed.windowStart !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeBucket(key: string, bucket: Bucket | null): Promise<void> {
  if (!bucket) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await AsyncStorage.setItem(key, JSON.stringify(bucket));
}

function freshBucket(now: number): Bucket {
  return { count: 0, windowStart: now };
}

export async function checkRateLimit(
  scope: string,
  identifier: string,
  maxAttempts: number,
  windowMs: number,
): Promise<{ allowed: true } | { allowed: false; retryAfterMs: number }> {
  const key = storageKey(scope, identifier);
  const now = Date.now();
  const bucket = await readBucket(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    return { allowed: true };
  }
  if (bucket.count >= maxAttempts) {
    return {
      allowed: false,
      retryAfterMs: Math.max(0, windowMs - (now - bucket.windowStart)),
    };
  }
  return { allowed: true };
}

export async function assertRateLimit(
  scope: string,
  identifier: string,
  maxAttempts: number,
  windowMs: number,
): Promise<void> {
  const result = await checkRateLimit(scope, identifier, maxAttempts, windowMs);
  if (!result.allowed) {
    throw new RateLimitError(result.retryAfterMs);
  }
}

/** Count every attempt (sign-up, password reset email, OAuth try). */
export async function consumeRateLimitAttempt(
  scope: string,
  identifier: string,
  maxAttempts: number,
  windowMs: number,
): Promise<void> {
  const key = storageKey(scope, identifier);
  const now = Date.now();
  let bucket = await readBucket(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    bucket = freshBucket(now);
  }

  if (bucket.count >= maxAttempts) {
    throw new RateLimitError(windowMs - (now - bucket.windowStart));
  }

  bucket.count += 1;
  await writeBucket(key, bucket);
}

/** Increment only after a failed sign-in. */
export async function recordRateLimitFailure(
  scope: string,
  identifier: string,
  maxAttempts: number,
  windowMs: number,
): Promise<void> {
  const key = storageKey(scope, identifier);
  const now = Date.now();
  let bucket = await readBucket(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    bucket = { count: 1, windowStart: now };
  } else {
    bucket.count += 1;
  }

  await writeBucket(key, bucket);
}

export async function resetRateLimit(
  scope: string,
  identifier: string,
): Promise<void> {
  await writeBucket(storageKey(scope, identifier), null);
}

/** In-memory min interval between chat sends (per conversation). */
const lastChatSendAt = new Map<string, number>();

export function assertChatSendInterval(conversationId: string): void {
  const minMs = RATE_LIMITS.chat.minIntervalMs;
  const key = conversationId;
  const last = lastChatSendAt.get(key) ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < minMs) {
    throw new RateLimitError(minMs - elapsed);
  }
}

export function markChatSend(conversationId: string): void {
  lastChatSendAt.set(conversationId, Date.now());
}
