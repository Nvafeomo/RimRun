import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../context/AuthContext";
import { colors, spacing, borderRadius } from "../../../constants/theme";
import { supabase } from "../../../lib/supabase";
import { blockUser, unblockUser } from "../../../lib/blocking";
import { AvatarImage } from "../../../components/AvatarImage";
import { ReportUserModal } from "../../../components/ReportUserModal";

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
    "username, profile_image_url, profile_public_show_friends, profile_public_show_courts_joined, profile_public_show_courts_added";
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

  const [friendEdge, outReq, inReq] = await Promise.all([
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
  ]);

  const isFriend = !!friendEdge.data;
  let friendship_status: FriendshipStatus = "none";
  if (isFriend) friendship_status = "friends";
  else if (outReq.data) friendship_status = "pending_outgoing";
  else if (inReq.data) friendship_status = "pending_incoming";

  /** DM/group messaging requires friendship; court chat is separate. */
  const can_open_dm = isFriend;

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
  const [reportOpen, setReportOpen] = useState(false);

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
          <Pressable onPress={() => router.back()} style={styles.headerSide}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitleCenter} numberOfLines={1}>
            Profile
          </Text>
          <View style={styles.headerSide} />
        </View>
        <View style={styles.heroAccent} />
        <View style={styles.centered}>
          <View style={styles.unavailableIconWrap}>
            <Ionicons name="person-off-outline" size={40} color={colors.textMuted} />
          </View>
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
        <Pressable onPress={() => router.back()} style={styles.headerSide}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitleCenter} numberOfLines={1}>
          Profile
        </Text>
        <View style={styles.headerSide} />
      </View>
      <View style={styles.heroAccent} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.avatarRing}>
            <AvatarImage
              userId={summary.user_id}
              username={summary.username}
              profileImageUrl={summary.profile_image_url}
              size={108}
            />
          </View>
          <Text style={styles.name}>{displayName}</Text>
          {st === "friends" && (
            <View style={styles.friendChip}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.friendChipText}>Friends</Text>
            </View>
          )}
          {st === "pending_outgoing" && (
            <View style={styles.pendingChip}>
              <Ionicons name="time-outline" size={16} color={colors.primaryLight} />
              <Text style={styles.pendingChipText}>Request sent</Text>
            </View>
          )}
          {st === "pending_incoming" && (
            <View style={styles.pendingChip}>
              <Ionicons name="mail-unread-outline" size={16} color={colors.primaryLight} />
              <Text style={styles.pendingChipText}>Wants to connect</Text>
            </View>
          )}

          <View style={styles.statsPanel}>
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
                Joined
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
                Added
              </Text>
            </View>
          </View>
        </View>

        {st === "pending_incoming" && (
          <Text style={styles.statusNote}>
            Open <Text style={styles.statusNoteEm}>Friends</Text> to accept or decline.
          </Text>
        )}

        {blockedByMe ? (
          <View style={styles.blockedBanner}>
            <Ionicons name="ban-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.blockedBannerText}>
              You blocked this person. Unblock to message or add them as a friend.
            </Text>
          </View>
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
              Direct messages are only with friends. Send a friend request first,
              or talk at a court you both follow.
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
            <View style={styles.dangerRow}>
              <Pressable
                style={[styles.reportBtn, actioning && styles.blockBtnDisabled]}
                onPress={() => setReportOpen(true)}
                disabled={actioning}
              >
                <Ionicons name="flag-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.reportBtnText}>Report</Text>
              </Pressable>
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
            </View>
          )}
        </View>
      </ScrollView>

      <ReportUserModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        reportedUserId={userId}
        contextLabel={`Reporting @${displayName}`}
      />
    </SafeAreaView>
  );
}

const cardShadow =
  Platform.OS === "ios"
    ? {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      }
    : { elevation: 6 };

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
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
  },
  headerSide: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleCenter: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
    letterSpacing: -0.2,
  },
  heroAccent: {
    height: 3,
    backgroundColor: colors.primary,
    borderRadius: 2,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    opacity: 0.9,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    ...cardShadow,
  },
  avatarRing: {
    borderWidth: 3,
    borderColor: colors.primary,
    borderRadius: borderRadius.full,
    padding: 3,
    backgroundColor: colors.background,
  },
  name: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
    marginTop: spacing.md,
    letterSpacing: -0.2,
  },
  friendChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.sm,
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.35)",
  },
  friendChipText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "700",
  },
  pendingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pendingChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  statsPanel: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: spacing.lg,
    width: "100%",
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: colors.border,
  },
  statusNote: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
    textAlign: "center",
    paddingHorizontal: spacing.sm,
  },
  statusNoteEm: {
    color: colors.primaryLight,
    fontWeight: "700",
  },
  blockedBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  blockedBannerText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
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
    paddingVertical: spacing.md + 2,
    borderRadius: borderRadius.md,
    ...cardShadow,
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
    backgroundColor: colors.surface,
    paddingVertical: spacing.md + 2,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnDisabled: {
    opacity: 0.65,
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
    lineHeight: 19,
    textAlign: "center",
    paddingHorizontal: spacing.xs,
  },
  dangerRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  reportBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  reportBtnText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: "600",
  },
  blockBtn: {
    flex: 1,
    backgroundColor: colors.error,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  blockBtnDisabled: {
    opacity: 0.7,
  },
  blockBtnText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  unblockBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md + 2,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
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
  unavailableIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
