import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../context/AuthContext";
import { colors, spacing, borderRadius } from "../../../constants/theme";
import { supabase } from "../../../lib/supabase";
import { blockUser, unblockUser } from "../../../lib/blocking";
import { AvatarImage } from "../../../components/AvatarImage";

type FriendshipStatus =
  | "self"
  | "friends"
  | "pending_outgoing"
  | "pending_incoming"
  | "none";

type PublicProfileSummary = {
  user_id: string;
  username: string | null;
  profile_image_url: string | null;
  friends_count: number | null;
  courts_joined_count: number | null;
  courts_added_count: number | null;
  friendship_status: FriendshipStatus;
  can_open_dm: boolean;
};

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function parseSummary(data: unknown): PublicProfileSummary | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const userId = o.user_id;
  if (typeof userId !== "string") return null;
  const status = o.friendship_status;
  const okStatus =
    status === "self" ||
    status === "friends" ||
    status === "pending_outgoing" ||
    status === "pending_incoming" ||
    status === "none";
  if (!okStatus) return null;
  return {
    user_id: userId,
    username: typeof o.username === "string" ? o.username : null,
    profile_image_url:
      typeof o.profile_image_url === "string" ? o.profile_image_url : null,
    friends_count: numOrNull(o.friends_count),
    courts_joined_count: numOrNull(o.courts_joined_count),
    courts_added_count: numOrNull(o.courts_added_count),
    friendship_status: status,
    can_open_dm: o.can_open_dm === true,
  };
}

function isUndefinedColumnError(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    if ((err as { code?: string }).code === "42703") return true;
  }
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : "";
  return /column .* does not exist/i.test(msg);
}

/** PostgREST: function not in schema (migration not applied yet). */
function isRpcMissingError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "PGRST202" || err.code === "42883") return true;
  const m = err.message ?? "";
  return /could not find .* function/i.test(m) || /schema cache/i.test(m);
}

/**
 * When `get_public_profile_summary` is not deployed, approximate the screen from
 * tables the client may read. Friends / courts joined totals are not exposed by RLS
 * for other users — those stay null (—) until the RPC exists.
 */
async function fetchPublicProfileFallback(
  viewerId: string,
  targetId: string,
): Promise<PublicProfileSummary | null> {
  const SELECT_WITH_PRIVACY =
    "username, profile_image_url, profile_public_show_friends, profile_public_show_courts_joined, profile_public_show_courts_added, messages_only_from_friends";
  let profRes = await supabase
    .from("profiles")
    .select(SELECT_WITH_PRIVACY)
    .eq("id", targetId)
    .maybeSingle();

  if (profRes.error && isUndefinedColumnError(profRes.error)) {
    profRes = await supabase
      .from("profiles")
      .select("username, profile_image_url")
      .eq("id", targetId)
      .maybeSingle();
  } else if (profRes.error) {
    console.error("public profile fallback profiles", profRes.error);
    return null;
  }

  const prof = profRes.data;
  if (!prof) return null;

  const showAdded =
    (prof as { profile_public_show_courts_added?: boolean }).profile_public_show_courts_added ?? true;
  const messagesOnly =
    (prof as { messages_only_from_friends?: boolean }).messages_only_from_friends ?? false;

  const [friendEdge, outReq, inReq, myParts] = await Promise.all([
    supabase
      .from("friendships")
      .select("user_id")
      .eq("user_id", viewerId)
      .eq("friend_id", targetId)
      .maybeSingle(),
    supabase
      .from("friend_requests")
      .select("id")
      .eq("sender_id", viewerId)
      .eq("receiver_id", targetId)
      .eq("status", "pending")
      .maybeSingle(),
    supabase
      .from("friend_requests")
      .select("id")
      .eq("sender_id", targetId)
      .eq("receiver_id", viewerId)
      .eq("status", "pending")
      .maybeSingle(),
    supabase.from("conversation_participants").select("conversation_id").eq("user_id", viewerId),
  ]);

  const isFriend = !!friendEdge.data;
  let friendship_status: FriendshipStatus = "none";
  if (isFriend) friendship_status = "friends";
  else if (outReq.data) friendship_status = "pending_outgoing";
  else if (inReq.data) friendship_status = "pending_incoming";

  const convIds = (myParts.data ?? []).map((r) => r.conversation_id);
  let hasDm = false;
  if (convIds.length > 0) {
    const { data: dms } = await supabase
      .from("conversations")
      .select("id")
      .eq("type", "dm")
      .in("id", convIds);
    const dmIds = (dms ?? []).map((d) => d.id);
    if (dmIds.length > 0) {
      const { data: otherPart } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .in("conversation_id", dmIds)
        .eq("user_id", targetId)
        .limit(1);
      hasDm = (otherPart ?? []).length > 0;
    }
  }

  const can_open_dm = hasDm || isFriend || !messagesOnly;

  let addedCount: number | null = null;
  if (showAdded) {
    const { count, error: countErr } = await supabase
      .from("courts")
      .select("id", { count: "exact", head: true })
      .eq("created_by", targetId);
    if (!countErr && typeof count === "number") addedCount = count;
  }

  return {
    user_id: targetId,
    username: prof.username ?? null,
    profile_image_url: prof.profile_image_url ?? null,
    /** RLS does not expose other users’ subscription/friend totals without the RPC. */
    friends_count: null,
    courts_joined_count: null,
    courts_added_count: addedCount,
    friendship_status,
    can_open_dm,
  };
}

export default function PublicUserProfileScreen() {
  const router = useRouter();
  const { userId: rawId } = useLocalSearchParams<{ userId: string }>();
  const { user } = useAuth();
  const userId = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "";

  const [summary, setSummary] = useState<PublicProfileSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id || !userId) {
      setSummary(null);
      setBlockedByMe(false);
      setLoading(false);
      return;
    }
    if (userId === user.id) {
      router.replace("/(app)/(tabs)/profile");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("get_public_profile_summary", {
      p_user_id: userId,
    });
    let next: PublicProfileSummary | null = null;
    if (error) {
      if (isRpcMissingError(error)) {
        next = await fetchPublicProfileFallback(user.id, userId);
      } else {
        console.error("get_public_profile_summary", error);
        setSummary(null);
        setBlockedByMe(false);
        setLoading(false);
        return;
      }
    } else {
      next = parseSummary(data);
    }
    setSummary(next);
    if (next) {
      const { data: blockRow } = await supabase
        .from("user_blocks")
        .select("blocked_id")
        .eq("blocker_id", user.id)
        .eq("blocked_id", userId)
        .maybeSingle();
      setBlockedByMe(!!blockRow);
    } else {
      setBlockedByMe(false);
    }
    setLoading(false);
  }, [user?.id, userId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDM = async () => {
    if (!user?.id || !userId) return;
    setActioning(true);
    const { data: convId, error } = await supabase.rpc(
      "get_or_create_dm_conversation",
      { p_other_user_id: userId },
    );
    setActioning(false);
    if (error || !convId) {
      const msg = error?.message ?? "";
      Alert.alert("Cannot open chat", msg || "Could not open chat.");
      return;
    }
    const title = summary?.username?.trim() || "Chat";
    router.push({
      pathname: "/(app)/chat/[conversationId]",
      params: { conversationId: convId as string, title },
    });
  };

  const sendFriendRequest = async () => {
    if (!user?.id || !userId || blockedByMe) return;
    setActioning(true);
    const { error } = await supabase.from("friend_requests").insert({
      sender_id: user.id,
      receiver_id: userId,
      status: "pending",
    });
    setActioning(false);
    if (error) {
      Alert.alert("Could not send request", error.message);
      return;
    }
    void load();
  };

  const promptBlock = () => {
    const name = summary?.username?.trim() || "User";
    Alert.alert(
      `Block ${name}?`,
      "They won't be able to interact with you or appear in your discovery search. You can unblock later from Friends → Blocked.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => void executeBlock(),
        },
      ],
    );
  };

  const executeBlock = async () => {
    if (!user?.id || !userId) return;
    setBlocking(true);
    const { error } = await blockUser(userId);
    setBlocking(false);
    if (error) {
      Alert.alert("Could not block", error.message);
      return;
    }
    router.back();
  };

  const executeUnblock = async () => {
    if (!user?.id || !userId) return;
    setBlocking(true);
    const { error } = await unblockUser(userId);
    setBlocking(false);
    if (error) {
      Alert.alert("Could not unblock", error.message);
      return;
    }
    setBlockedByMe(false);
    void load();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!summary) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.unavailableTitle}>Profile unavailable</Text>
          <Text style={styles.unavailableText}>
            This profile isn&apos;t available. The user may have blocked you or the
            account may not exist.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayName = summary.username?.trim() || "User";
  const st = summary.friendship_status;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <AvatarImage
            userId={summary.user_id}
            username={summary.username}
            profileImageUrl={summary.profile_image_url}
            size={96}
          />
          <Text style={styles.name}>{displayName}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {summary.friends_count === null ? "—" : summary.friends_count}
              </Text>
              <Text style={styles.statLabel}>Friends</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {summary.courts_joined_count === null
                  ? "—"
                  : summary.courts_joined_count}
              </Text>
              <Text style={styles.statLabel} numberOfLines={2}>
                Courts joined
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {summary.courts_added_count === null
                  ? "—"
                  : summary.courts_added_count}
              </Text>
              <Text style={styles.statLabel} numberOfLines={2}>
                Courts added
              </Text>
            </View>
          </View>
        </View>

        {st === "pending_outgoing" && (
          <Text style={styles.statusNote}>Friend request sent</Text>
        )}
        {st === "pending_incoming" && (
          <Text style={styles.statusNote}>
            This person sent you a friend request — open Friends to respond.
          </Text>
        )}

        {blockedByMe ? (
          <Text style={styles.blockedNote}>
            You blocked this person. Unblock to message or add them as a friend.
          </Text>
        ) : null}

        <View style={styles.actions}>
          {st === "none" && !blockedByMe && (
            <Pressable
              style={styles.primaryBtn}
              onPress={() => void sendFriendRequest()}
              disabled={actioning}
            >
              {actioning ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="person-add" size={20} color="#fff" />
                  <Text style={styles.primaryBtnText}>Add friend</Text>
                </>
              )}
            </Pressable>
          )}

          <Pressable
            style={[
              styles.secondaryBtn,
              (!summary.can_open_dm || blockedByMe) && styles.secondaryBtnDisabled,
            ]}
            onPress={() => void openDM()}
            disabled={actioning || !summary.can_open_dm || blockedByMe}
          >
            {actioning ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Ionicons
                  name="chatbubble-outline"
                  size={20}
                  color={
                    summary.can_open_dm && !blockedByMe
                      ? colors.primary
                      : colors.textMuted
                  }
                />
                <Text
                  style={[
                    styles.secondaryBtnText,
                    (!summary.can_open_dm || blockedByMe) &&
                      styles.secondaryBtnTextMuted,
                  ]}
                >
                  Message
                </Text>
              </>
            )}
          </Pressable>
          {!summary.can_open_dm && st !== "friends" && !blockedByMe && (
            <Text style={styles.dmHint}>
              This user only accepts messages from people on their friends list.
              Send a friend request first.
            </Text>
          )}

          {blockedByMe ? (
            <Pressable
              style={[styles.unblockBtn, blocking && styles.blockBtnDisabled]}
              onPress={() => void executeUnblock()}
              disabled={actioning || blocking}
            >
              {blocking ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <>
                  <Ionicons
                    name="hand-left-outline"
                    size={20}
                    color={colors.primary}
                  />
                  <Text style={styles.unblockBtnText}>Unblock</Text>
                </>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={[styles.blockBtn, blocking && styles.blockBtnDisabled]}
              onPress={promptBlock}
              disabled={actioning || blocking}
            >
              {blocking ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <Text style={styles.blockBtnText}>Block</Text>
              )}
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  name: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "600",
    marginTop: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    width: "100%",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    textAlign: "center",
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
  },
  statusNote: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  actions: {
    gap: spacing.md,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnDisabled: {
    opacity: 0.7,
  },
  secondaryBtnText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryBtnTextMuted: {
    color: colors.textMuted,
  },
  dmHint: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  blockedNote: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  /** Matches `profile.tsx` deleteAccountButton / deleteAccountText */
  blockBtn: {
    backgroundColor: colors.error,
    borderWidth: 1.5,
    borderColor: colors.text,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  blockBtnDisabled: {
    opacity: 0.7,
  },
  blockBtnText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  unblockBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  unblockBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary,
  },
  centered: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: "center",
  },
  unavailableTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  unavailableText: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
});
