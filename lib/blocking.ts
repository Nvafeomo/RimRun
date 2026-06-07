import { supabase } from "./supabase";

export type BlockedUserDisplay = {
  id: string;
  username: string | null;
  profile_image_url: string | null;
};

let blockedIdsCache: { userId: string; ids: Set<string> } | null = null;

export function invalidateBlockedUserIdsCache(): void {
  blockedIdsCache = null;
}

export async function fetchBlockedUserIds(
  viewerId: string,
): Promise<Set<string>> {
  if (blockedIdsCache?.userId === viewerId) {
    return new Set(blockedIdsCache.ids);
  }

  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocked_id")
    .eq("blocker_id", viewerId);

  if (error) {
    console.error("Error fetching blocked users:", error);
    return new Set();
  }

  const ids = new Set((data ?? []).map((row) => row.blocked_id));
  blockedIdsCache = { userId: viewerId, ids };
  return ids;
}

/** Display fields for users you blocked (RPC fallback in blocked-users-display-rpc.sql). */
export async function fetchBlockedUserDisplayList(): Promise<
  BlockedUserDisplay[]
> {
  const { data, error } = await supabase.rpc("get_my_blocked_users_display");

  if (!error && Array.isArray(data)) {
    return data.map(
      (row: {
        id: string;
        username: string | null;
        profile_image_url: string | null;
      }) => ({
        id: row.id,
        username: row.username ?? null,
        profile_image_url: row.profile_image_url ?? null,
      }),
    );
  }

  if (error) {
    console.warn(
      "get_my_blocked_users_display unavailable; using user_blocks + profiles:",
      error.message,
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return [];

  const { data: rows } = await supabase
    .from("user_blocks")
    .select("blocked_id, created_at")
    .eq("blocker_id", user.id)
    .order("created_at", { ascending: false });

  if (!rows?.length) return [];

  const ids = rows.map((r) => r.blocked_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, profile_image_url")
    .in("id", ids);

  const byId = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
  return ids.map((id) => ({
    id,
    username: byId[id]?.username ?? null,
    profile_image_url: byId[id]?.profile_image_url ?? null,
  }));
}

export async function fetchBlockedUserDisplay(
  blockedUserId: string,
): Promise<BlockedUserDisplay | null> {
  const list = await fetchBlockedUserDisplayList();
  return list.find((row) => row.id === blockedUserId) ?? null;
}

export function isBlockedUser(
  blockedIds: Set<string>,
  userId: string | null | undefined,
): boolean {
  return !!userId && blockedIds.has(userId);
}

export function filterMessagesExcludingBlocked<
  T extends { sender_id: string },
>(messages: T[], blockedIds: Set<string>, viewerId: string | undefined): T[] {
  if (blockedIds.size === 0) return messages;
  return messages.filter(
    (message) =>
      message.sender_id === viewerId ||
      !blockedIds.has(message.sender_id),
  );
}

export async function blockUser(
  blockedUserId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("block_user", {
    p_blocked_id: blockedUserId,
  });
  invalidateBlockedUserIdsCache();
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function unblockUser(
  blockedUserId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("unblock_user", {
    p_blocked_id: blockedUserId,
  });
  invalidateBlockedUserIdsCache();
  if (!error) {
    return { error: null };
  }

  if (!/could not find|schema cache/i.test(error.message)) {
    return { error: new Error(error.message) };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return { error: new Error("Not signed in") };
  }

  const { error: deleteError } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", blockedUserId);

  if (deleteError) {
    return { error: new Error(deleteError.message) };
  }
  return { error: null };
}

export type UserBlockStatus = {
  blockedByMe: boolean;
  blockedByThem: boolean;
};

export async function fetchUserBlockStatus(
  otherUserId: string,
): Promise<UserBlockStatus> {
  const { data, error } = await supabase.rpc("get_user_block_status", {
    p_other_user_id: otherUserId,
  });

  if (!error && data && typeof data === "object") {
    const row = data as {
      blocked_by_me?: boolean;
      blocked_by_them?: boolean;
    };
    return {
      blockedByMe: Boolean(row.blocked_by_me),
      blockedByThem: Boolean(row.blocked_by_them),
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return { blockedByMe: false, blockedByThem: false };
  }

  const { data: rows } = await supabase
    .from("user_blocks")
    .select("blocker_id, blocked_id")
    .or(
      `and(blocker_id.eq.${user.id},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${user.id})`,
    );

  let blockedByMe = false;
  let blockedByThem = false;
  for (const row of rows ?? []) {
    if (row.blocker_id === user.id && row.blocked_id === otherUserId) {
      blockedByMe = true;
    }
    if (row.blocker_id === otherUserId && row.blocked_id === user.id) {
      blockedByThem = true;
    }
  }
  return { blockedByMe, blockedByThem };
}

export async function sendFriendRequest(
  receiverId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("send_friend_request", {
    p_receiver_id: receiverId,
  });

  if (!error) {
    return { error: null };
  }

  if (!/could not find|schema cache/i.test(error.message)) {
    return { error: new Error(error.message) };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return { error: new Error("Not signed in") };
  }

  await supabase
    .from("friend_requests")
    .delete()
    .or(
      `and(sender_id.eq.${user.id},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${user.id})`,
    );

  const { error: insertError } = await supabase.from("friend_requests").insert({
    sender_id: user.id,
    receiver_id: receiverId,
    status: "pending",
  });

  if (insertError) {
    return { error: new Error(insertError.message) };
  }
  return { error: null };
}

export function parseBlockedSendError(
  message: string,
): { blocked: true; reason: string } | null {
  const msg = message.trim();
  if (/this person has you blocked/i.test(msg)) {
    return { blocked: true, reason: "This person has you blocked." };
  }
  if (/you cannot message this user/i.test(msg)) {
    return { blocked: true, reason: "You can't message this user." };
  }
  if (/^blocked:/i.test(msg)) {
    return {
      blocked: true,
      reason: msg.replace(/^blocked:\s*/i, "").trim() || "Messaging blocked.",
    };
  }
  return null;
}
