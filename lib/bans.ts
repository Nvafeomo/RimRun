import { supabase } from './supabase';

export type BanAppealStatus = {
  pending: boolean;
  lastStatus: string | null;
};

/** Returns true when the user has an active platform ban. */
export async function fetchIsUserBanned(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_user_banned', {
    p_user_id: userId,
  });
  if (error) {
    console.warn('is_user_banned RPC failed', error.message);
    return false;
  }
  return data === true;
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
  const trimmed = message.trim();
  if (trimmed.length < 10) {
    return { ok: false, error: 'Appeal must be at least 10 characters.' };
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
