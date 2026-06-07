import { supabase } from "./supabase";

export type ChatSenderProfile = {
  username: string | null;
  profile_image_url: string | null;
};

async function fetchPublicProfileSummary(
  userId: string,
): Promise<ChatSenderProfile | null> {
  const { data, error } = await supabase.rpc("get_public_profile_summary", {
    p_user_id: userId,
  });
  if (error || !data || typeof data !== "object") {
    return null;
  }
  const row = data as {
    username?: string | null;
    profile_image_url?: string | null;
  };
  return {
    username: row.username ?? null,
    profile_image_url: row.profile_image_url ?? null,
  };
}

/** Safe display fields for chat participants (RPC; see profiles-pii-rls-compat.sql). */
export async function fetchChatSenderProfiles(
  userIds: string[],
): Promise<Record<string, ChatSenderProfile>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const { data, error } = await supabase.rpc("get_profiles_for_chat_display", {
    p_user_ids: ids,
  });

  const result: Record<string, ChatSenderProfile> = {};

  if (error) {
    console.error("Error fetching chat sender profiles:", error);
  } else {
    for (const row of data ?? []) {
      const typed = row as {
        id: string;
        username: string | null;
        profile_image_url: string | null;
      };
      result[typed.id] = {
        username: typed.username ?? null,
        profile_image_url: typed.profile_image_url ?? null,
      };
    }
  }

  const missing = ids.filter((id) => !result[id]);
  if (missing.length > 0) {
    await Promise.all(
      missing.map(async (id) => {
        const summary = await fetchPublicProfileSummary(id);
        if (summary) {
          result[id] = summary;
        }
      }),
    );
  }

  return result;
}

export async function fetchConversationParticipantIds(
  conversationId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId);

  if (error) {
    console.error("Error fetching conversation participants:", error);
    return [];
  }

  return [...new Set((data ?? []).map((row) => row.user_id).filter(Boolean))];
}
