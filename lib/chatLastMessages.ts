import { supabase } from "./supabase";

export type LastMessagePreview = {
  content: string;
  created_at: string;
};

/** Latest non-deleted preview per conversation (requires DB RPC). */
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
