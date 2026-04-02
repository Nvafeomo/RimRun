import { supabase } from "./supabase";

/**
 * Deletes all messages in a DM/group conversation, then removes the current user
 * from participants. Requires policies from scripts/dm-delete-messages-and-leave.sql.
 */
export async function clearConversationAndLeave(
  conversationId: string,
  currentUserId: string
): Promise<{ error: Error | null }> {
  const { error: msgErr } = await supabase
    .from("messages")
    .delete()
    .eq("conversation_id", conversationId);
  if (msgErr) return { error: new Error(msgErr.message) };

  const { error: partErr } = await supabase
    .from("conversation_participants")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", currentUserId);
  if (partErr) return { error: new Error(partErr.message) };

  return { error: null };
}
