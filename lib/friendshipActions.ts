import { supabase } from "./supabase";

/** Removes both friendship rows for this pair (RLS allows delete when user is either side). */
export async function removeFriendship(
  currentUserId: string,
  friendUserId: string
): Promise<{ error: Error | null }> {
  const { error: e1 } = await supabase
    .from("friendships")
    .delete()
    .eq("user_id", currentUserId)
    .eq("friend_id", friendUserId);
  if (e1) return { error: new Error(e1.message) };
  const { error: e2 } = await supabase
    .from("friendships")
    .delete()
    .eq("user_id", friendUserId)
    .eq("friend_id", currentUserId);
  if (e2) return { error: new Error(e2.message) };
  return { error: null };
}
