import { supabase } from './supabase';
import { RATE_LIMITS } from './rateLimitConfig';
import {
  consumeRateLimitAttempt,
  isRateLimitError,
  mapExternalRateLimitError,
} from './rateLimit';
import { INPUT_LIMITS, sanitizeBanAppealMessage } from './security';

export type BanAppealStatus = {
  pending: boolean;
  lastStatus: string | null;
};

/** Result of a ban status lookup. Failures must be treated as blocked (fail closed). */
export type BanCheckResult =
  | { ok: true; banned: boolean }
  | { ok: false; error: string };

/** Returns ban status for a user. On RPC failure, returns ok:false (caller must fail closed). */
export async function fetchIsUserBanned(userId: string): Promise<BanCheckResult> {
  const { data, error } = await supabase.rpc('is_user_banned', {
    p_user_id: userId,
  });
  if (error) {
    console.warn('is_user_banned RPC failed', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, banned: data === true };
}

export async function fetchBanAppealStatus(): Promise<BanAppealStatus> {
  const { data, error } = await supabase.rpc('my_ban_appeal_status');
  if (error) {
    console.warn('my_ban_appeal_status failed', error.message);
    return { pending: false, lastStatus: null };
  }
  const row = data as { pending?: boolean; last_status?: string | null } | null;
  return {
    pending: row?.pending === true,
    lastStatus: row?.last_status ?? null,
  };
}

export async function submitBanAppeal(
  message: string,
): Promise<{ ok: true } | { ok: false; reason?: string; error?: string }> {
  const raw = message.trim();
  if (raw.length > INPUT_LIMITS.banAppeal) {
    return { ok: false, error: 'Appeal is too long.' };
  }
  const trimmed = sanitizeBanAppealMessage(raw);
  if (trimmed.length < 10) {
    return { ok: false, error: 'Appeal must be at least 10 characters.' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return { ok: false, error: 'Not signed in' };
  }

  const { maxAttempts, windowMs } = RATE_LIMITS.moderation.banAppeal;
  try {
    await consumeRateLimitAttempt(
      'moderation:banAppeal',
      user.id,
      maxAttempts,
      windowMs,
    );
  } catch (error) {
    if (isRateLimitError(error)) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: mapExternalRateLimitError(error).message };
  }

  const { data, error } = await supabase.rpc('submit_ban_appeal', {
    p_message: trimmed,
  });
  if (error) {
    return { ok: false, error: error.message };
  }

  const result = data as { ok?: boolean; reason?: string } | null;
  if (result?.ok) {
    return { ok: true };
  }
  return { ok: false, reason: result?.reason ?? 'unknown' };
}
