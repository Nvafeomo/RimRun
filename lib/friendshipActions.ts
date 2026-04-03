import { supabase } from "./supabase";

/**
 * Ends friendship and records dissolution for 7-day grace re-add (see phase-3 SQL).
 */
export async function removeFriendship(
  _currentUserId: string,
  friendUserId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("remove_friendship_graceful", {
    p_other_user_id: friendUserId,
  });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
