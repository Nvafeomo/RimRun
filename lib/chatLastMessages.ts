import { supabase } from "./supabase";

/** Text and timestamp of a conversation's most recent message, for chat list rows. */
export type LastMessagePreview = {
  /** Message body as stored in `messages.content`. */
  content: string;
  /** ISO timestamp of when the message was sent. */
  created_at: string;
};

/**
 * Latest non-deleted preview per conversation, keyed by conversation id.
 * Requires the `get_conversation_last_messages` DB RPC. On error, logs and
 * returns an empty map so the chat list still renders.
 */
export async function fetchLastMessagesByConversation(
  conversationIds: string[],
): Promise<Map<string, LastMessagePreview>> {
  const result = new Map<string, LastMessagePreview>();
  const convIds = [...new Set(conversationIds.filter(Boolean))];
  if (convIds.length === 0) return result;

  const { data, error } = await supabase.rpc("get_conversation_last_messages", {
    p_conversation_ids: convIds,
  });

  if (error) {
    console.error("Error fetching last message previews:", error);
    return result;
  }

  for (const row of data ?? []) {
    if (!row.conversation_id) continue;
    result.set(row.conversation_id, {
      content: row.content,
      created_at: row.created_at,
    });
  }

  return result;
}
