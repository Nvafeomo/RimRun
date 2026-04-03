import { supabase } from './supabase';

export async function blockUser(blockedUserId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('block_user', { p_blocked_id: blockedUserId });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function unblockUser(blockedUserId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('unblock_user', { p_blocked_id: blockedUserId });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
