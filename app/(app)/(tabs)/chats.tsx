import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import { useCourtAliases } from "../../../hooks/useCourtAliases";
import { colors, spacing, borderRadius, shadows, typography } from "../../../constants/theme";
import { formatChatListTime } from "../../../lib/formatRelativeTime";
import { fetchLastMessagesByConversation } from "../../../lib/chatLastMessages";
import { clearConversationAndLeave } from "../../../lib/chatDeletion";
import { FriendsPanel } from "../../../components/FriendsPanel";
import { NewGroupChatModal } from "../../../components/NewGroupChatModal";

type CourtChatItem = {
  courtId: string;
  courtName: string;
  conversationId: string;
  lastMessage?: string;
  lastMessageAt?: string;
};

type MessageThreadItem =
  | {
      kind: "dm";
      conversationId: string;
      otherUserId: string;
      otherUsername: string;
      lastMessage?: string;
      lastMessageAt?: string;
    }
  | {
      kind: "group";
      conversationId: string;
      title: string;
      lastMessage?: string;
      lastMessageAt?: string;
    };

export default function ChatsScreen() {
  const router = useRouter();
  const { tab: tabParam } = useLocalSearchParams<{
    tab?: string | string[];
  }>();
  const { user } = useAuth();
  const { getDisplayName } = useCourtAliases();
  const [activeTab, setActiveTab] = useState<
    "courts" | "messages" | "friends"
  >("messages");
  const [courtChats, setCourtChats] = useState<CourtChatItem[]>([]);
  const [messageThreads, setMessageThreads] = useState<MessageThreadItem[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [threadDeletingId, setThreadDeletingId] = useState<string | null>(null);
  const [openingCourtId, setOpeningCourtId] = useState<string | null>(null);

  const sortCourtChats = useCallback((items: CourtChatItem[]) => {
    return [...items].sort(
      (a, b) =>
        new Date(b.lastMessageAt ?? 0).getTime() -
        new Date(a.lastMessageAt ?? 0).getTime(),
    );
  }, []);

  const applyLastMessagePreviews = useCallback(
    async (items: CourtChatItem[]): Promise<CourtChatItem[]> => {
      const convIds = items
        .map((row) => row.conversationId)
        .filter((id): id is string => !!id);
      if (convIds.length === 0) return items;

      const lastByConv = await fetchLastMessagesByConversation(convIds);

      return items.map((row) => {
        if (!row.conversationId) return row;
        const last = lastByConv.get(row.conversationId);
        if (!last) return row;
        return {
          ...row,
          lastMessage: last.content,
          lastMessageAt: last.created_at,
        };
      });
    },
    [],
  );

  const tabFromParams =
    typeof tabParam === "string"
      ? tabParam
      : Array.isArray(tabParam)
        ? tabParam[0]
        : undefined;

  useEffect(() => {
    if (tabFromParams === "courts") setActiveTab("courts");
    else if (tabFromParams === "messages") setActiveTab("messages");
    else if (tabFromParams === "friends") setActiveTab("friends");
  }, [tabFromParams]);

  const fetchCourtChats = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!user?.id) {
        setCourtChats([]);
        return;
      }
      try {
        const { data: subs, error: subsError } = await supabase
          .from("court_subscriptions")
          .select("court_id")
          .eq("user_id", user.id);

        if (subsError || !subs?.length) {
          setCourtChats([]);
          return;
        }

        const courtIds = subs.map((s) => s.court_id);

        const { data: courts, error: courtsError } = await supabase
          .from("courts")
          .select("id, name")
          .in("id", courtIds);

        if (courtsError || !courts?.length) {
          setCourtChats([]);
          return;
        }

        const { data: convs, error: convsError } = await supabase
          .from("conversations")
          .select("id, court_id")
          .eq("type", "court")
          .in("court_id", courtIds);

        if (convsError) {
          setCourtChats([]);
          return;
        }

        const convByCourt = Object.fromEntries(
          (convs ?? []).map((c) => [c.court_id, c.id]),
        );

        const items: CourtChatItem[] = courts.map((court) => ({
          courtId: court.id,
          courtName: court.name ?? "Court",
          conversationId: convByCourt[court.id] ?? "",
        }));

        // Paint the list immediately; hydrate previews in one batched query.
        setCourtChats(sortCourtChats(items));

        const withPreviews = await applyLastMessagePreviews(items);
        setCourtChats(sortCourtChats(withPreviews));
      } catch (err) {
        console.error("Error fetching court chats:", err);
        if (!opts?.silent) {
          setCourtChats([]);
        }
      }
    },
    [user?.id, sortCourtChats, applyLastMessagePreviews],
  );

  const fetchMessageThreads = useCallback(async () => {
    if (!user?.id) {
      setMessageThreads([]);
      return;
    }
    try {
      const { data: myParts } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id);
      const myConvIds = [
        ...new Set((myParts ?? []).map((p) => p.conversation_id)),
      ];
      if (!myConvIds.length) {
        setMessageThreads([]);
        return;
      }

      const { data: convRows } = await supabase
        .from("conversations")
        .select("id, type, name")
        .in("id", myConvIds);

      const groupConvs = (convRows ?? []).filter((c) => c.type === "group");
      const dmIds = (convRows ?? []).filter((c) => c.type === "dm").map((c) => c.id);
      const groupConvIds = groupConvs.map((c) => c.id);
      const groupConvIdSet = new Set(groupConvIds);
      const threadConvIds = [...groupConvIds, ...dmIds];

      const [lastByConv, partsResult] = await Promise.all([
        fetchLastMessagesByConversation(threadConvIds),
        threadConvIds.length > 0
          ? supabase
              .from("conversation_participants")
              .select("conversation_id, user_id")
              .in("conversation_id", threadConvIds)
          : Promise.resolve({ data: [] as { conversation_id: string; user_id: string }[] }),
      ]);

      const allParts = partsResult.data ?? [];

      const othersByGroupConv = new Map<string, string[]>();
      for (const part of allParts) {
        if (!groupConvIdSet.has(part.conversation_id) || part.user_id === user.id) {
          continue;
        }
        const list = othersByGroupConv.get(part.conversation_id) ?? [];
        list.push(part.user_id);
        othersByGroupConv.set(part.conversation_id, list);
      }

      const groupMemberIds = [
        ...new Set([...othersByGroupConv.values()].flat()),
      ];
      const otherByDmConv = new Map<string, string>();
      for (const cid of dmIds) {
        const other = allParts.find(
          (p) => p.conversation_id === cid && p.user_id !== user.id,
        );
        if (other) otherByDmConv.set(cid, other.user_id);
      }
      const dmOtherIds = [...new Set([...otherByDmConv.values()])];
      const profileIds = [...new Set([...groupMemberIds, ...dmOtherIds])];

      const { data: profiles } =
        profileIds.length > 0
          ? await supabase
              .from("profiles")
              .select("id, username")
              .in("id", profileIds)
          : { data: [] as { id: string; username: string | null }[] };
      const nameMap = Object.fromEntries(
        (profiles ?? []).map((p) => [p.id, p.username ?? "?"]),
      );

      const groupItems: MessageThreadItem[] = groupConvs.map((c) => {
        const otherIds = othersByGroupConv.get(c.id) ?? [];
        const names = otherIds.map((id) => nameMap[id] ?? "?").sort().join(", ");
        const title = c.name?.trim() || names || "Group chat";
        const last = lastByConv.get(c.id);
        return {
          kind: "group" as const,
          conversationId: c.id,
          title,
          lastMessage: last?.content,
          lastMessageAt: last?.created_at,
        };
      });

      const dmItems: MessageThreadItem[] = [];
      for (const cid of dmIds) {
        const otherId = otherByDmConv.get(cid);
        if (!otherId) continue;
        const last = lastByConv.get(cid);
        dmItems.push({
          kind: "dm",
          conversationId: cid,
          otherUserId: otherId,
          otherUsername: nameMap[otherId] ?? "Unknown",
          lastMessage: last?.content,
          lastMessageAt: last?.created_at,
        });
      }

      const merged = [...dmItems, ...groupItems].sort(
        (a, b) =>
          new Date(b.lastMessageAt ?? 0).getTime() -
          new Date(a.lastMessageAt ?? 0).getTime(),
      );
      setMessageThreads(merged);
    } catch (err) {
      console.error("Error fetching message threads:", err);
      setMessageThreads([]);
    }
  }, [user?.id]);

  // Defer court-chat work until the Court Chats sub-tab is open so switching
  // from the map (Courts tab) to Chats is not blocked by N+1 queries.
  useEffect(() => {
    if (activeTab !== "courts") return;
    let cancelled = false;
    setLoading(true);
    fetchCourtChats().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab, fetchCourtChats]);

  useEffect(() => {
    if (activeTab === "messages") fetchMessageThreads();
  }, [activeTab, fetchMessageThreads]);

  /** Refresh when returning from a chat — only the active sub-tab. */
  useFocusEffect(
    useCallback(() => {
      if (activeTab === "messages") {
        void fetchMessageThreads();
      } else if (activeTab === "courts") {
        void fetchCourtChats({ silent: true });
      }
    }, [fetchMessageThreads, fetchCourtChats, activeTab]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchCourtChats();
    setRefreshing(false);
  };

  const openMessageThread = (item: MessageThreadItem) => {
    router.push({
      pathname: "/(app)/chat/[conversationId]",
      params: {
        conversationId: item.conversationId,
        title: item.kind === "dm" ? item.otherUsername : item.title,
      },
    });
  };

  const confirmDeleteThread = (item: MessageThreadItem) => {
    const isGroup = item.kind === "group";
    const name = item.kind === "dm" ? item.otherUsername : item.title;
    Alert.alert(
      isGroup ? "Delete group chat?" : "Delete conversation?",
      isGroup
        ? `This deletes all messages in "${name}" for everyone and removes you from the group.`
        : `This deletes all messages with ${name} and removes the chat from your list. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void handleDeleteThread(item),
        },
      ]
    );
  };

  const handleDeleteThread = async (item: MessageThreadItem) => {
    if (!user?.id) return;
    setThreadDeletingId(item.conversationId);
    const { error } = await clearConversationAndLeave(
      item.conversationId,
      user.id
    );
    setThreadDeletingId(null);
    if (error) {
      Alert.alert("Could not delete", error.message);
      return;
    }
    await fetchMessageThreads();
  };

  const openCourtChat = async (item: CourtChatItem) => {
    let conversationId = item.conversationId;
    if (!conversationId) {
      setOpeningCourtId(item.courtId);
      try {
        const { data: newConvId, error } = await supabase.rpc(
          "get_or_create_court_conversation",
          { p_court_id: item.courtId },
        );
        if (error || !newConvId) {
          Alert.alert("Could not open chat", "Try again in a moment.");
          return;
        }
        conversationId = String(newConvId);
        setCourtChats((prev) =>
          sortCourtChats(
            prev.map((row) =>
              row.courtId === item.courtId ? { ...row, conversationId } : row,
            ),
          ),
        );
      } finally {
        setOpeningCourtId(null);
      }
    }
    router.push({
      pathname: "/(app)/chat/[conversationId]",
      params: {
        conversationId,
        title: getDisplayName(item.courtId, item.courtName),
        courtId: item.courtId,
        courtName: item.courtName,
      },
    });
  };

  const renderCourtChatItem = ({
    item,
    isLast,
  }: {
    item: CourtChatItem;
    isLast?: boolean;
  }) => {
    const opening = openingCourtId === item.courtId;
    return (
    <View style={[styles.courtChatRow, isLast && styles.courtChatRowLast]}>
      <Pressable
        style={styles.threadRowMain}
        onPress={() => void openCourtChat(item)}
        disabled={opening}
        android_ripple={{ color: colors.border }}
      >
        <View style={styles.courtChatIconWrap}>
          <Ionicons name="basketball" size={22} color={colors.primary} />
        </View>
        <View style={styles.chatItemContent}>
          <View style={styles.chatItemHeader}>
            <Text style={styles.chatItemTitle} numberOfLines={1}>
              {getDisplayName(item.courtId, item.courtName)}
            </Text>
            {item.lastMessageAt ? (
              <Text style={styles.chatItemTime}>
                {formatChatListTime(item.lastMessageAt)}
              </Text>
            ) : null}
          </View>
          <View style={styles.courtChatMetaRow}>
            <View style={styles.courtChatPill}>
              <Text style={styles.courtChatPillText}>Court chat</Text>
            </View>
          </View>
          <Text
            style={[
              styles.chatItemPreview,
              !item.lastMessage && styles.chatItemPreviewEmpty,
            ]}
            numberOfLines={2}
          >
            {item.lastMessage ?? "No messages yet — tap to say hi"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>
    </View>
    );
  };

  const courtChatsListHeader =
    courtChats.length > 0 ? (
      <View style={styles.courtsListHeader}>
        <Text style={styles.listHeaderText}>
          {courtChats.length} subscribed court
          {courtChats.length !== 1 ? "s" : ""}
        </Text>
      </View>
    ) : null;

  const renderMessageThreadItem = ({ item }: { item: MessageThreadItem }) => {
    const deleting = threadDeletingId === item.conversationId;
    return (
      <View style={styles.threadRow}>
        <Pressable
          style={styles.threadRowMain}
          onPress={() => openMessageThread(item)}
          disabled={deleting}
          android_ripple={{ color: colors.border }}
        >
          <View style={styles.chatItemIcon}>
            {item.kind === "dm" ? (
              <Pressable
                onPress={() =>
                  router.push(`/(app)/user/${item.otherUserId}`)
                }
                hitSlop={8}
                accessibilityLabel="View profile"
              >
                <Ionicons name="person" size={24} color={colors.primary} />
              </Pressable>
            ) : (
              <Ionicons name="people" size={24} color={colors.primary} />
            )}
          </View>
          <View style={styles.chatItemContent}>
            <View style={styles.chatItemHeader}>
              <Text style={styles.chatItemTitle} numberOfLines={1}>
                {item.kind === "dm" ? item.otherUsername : item.title}
              </Text>
              {item.lastMessageAt ? (
                <Text style={styles.chatItemTime}>
                  {formatChatListTime(item.lastMessageAt)}
                </Text>
              ) : null}
            </View>
            <Text style={styles.chatItemPreview} numberOfLines={1}>
              {item.lastMessage ?? "No messages yet"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
        <Pressable
          style={styles.threadDeleteBtn}
          onPress={() => confirmDeleteThread(item)}
          disabled={deleting}
          hitSlop={10}
          accessibilityLabel="Delete conversation"
        >
          {deleting ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <Ionicons name="trash-outline" size={22} color={colors.textMuted} />
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTextBlock}>
          <Text style={styles.title}>Chats</Text>
          <View style={styles.titleAccent} />
          <Text style={styles.subtitle}>
            {activeTab === "courts"
              ? "Court chats for your subscribed courts"
              : activeTab === "friends"
                ? "Friends, requests, and add people"
                : "Direct messages and groups"}
          </Text>
        </View>
        {activeTab === "messages" && (
          <Pressable
            onPress={() => setNewGroupOpen(true)}
            hitSlop={12}
            style={styles.headerPlus}
          >
            <Ionicons name="add-circle" size={32} color={colors.primary} />
          </Pressable>
        )}
      </View>

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === "messages" && styles.tabActive]}
          onPress={() => setActiveTab("messages")}
        >
          <Ionicons
            name="chatbubbles"
            size={18}
            color={activeTab === "messages" ? colors.primary : colors.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === "messages" && styles.tabTextActive,
            ]}
            numberOfLines={1}
          >
            Messages
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "courts" && styles.tabActive]}
          onPress={() => setActiveTab("courts")}
        >
          <Ionicons
            name="basketball"
            size={18}
            color={activeTab === "courts" ? colors.primary : colors.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === "courts" && styles.tabTextActive,
            ]}
            numberOfLines={1}
          >
            Courts
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "friends" && styles.tabActive]}
          onPress={() => setActiveTab("friends")}
        >
          <Ionicons
            name="people"
            size={18}
            color={activeTab === "friends" ? colors.primary : colors.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === "friends" && styles.tabTextActive,
            ]}
            numberOfLines={1}
          >
            Friends
          </Text>
        </Pressable>
      </View>

      <View style={styles.body}>
      {activeTab === "messages" ? (
        messageThreads.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons
                name="chatbubbles-outline"
                size={40}
                color={colors.textMuted}
              />
            </View>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyText}>
              Tap + to start a group, or open Friends to message someone directly.
            </Text>
            <Pressable
              style={styles.addFriendsButton}
              onPress={() => setActiveTab("friends")}
            >
              <Ionicons name="people" size={20} color="#fff" />
              <Text style={styles.addFriendsButtonText}>Go to Friends</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={messageThreads}
            renderItem={renderMessageThreadItem}
            keyExtractor={(item) => item.conversationId}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={async () => {
                  setRefreshing(true);
                  await fetchMessageThreads();
                  setRefreshing(false);
                }}
                tintColor={colors.primary}
              />
            }
          />
        )
      ) : activeTab === "courts" ? (
        loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={courtChats}
            renderItem={({ item, index }) =>
              renderCourtChatItem({
                item,
                isLast: index === courtChats.length - 1,
              })
            }
            keyExtractor={(item) => item.courtId}
            ListHeaderComponent={courtChatsListHeader}
            contentContainerStyle={
              courtChats.length === 0
                ? styles.emptyList
                : [styles.list, styles.courtsListBox]
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons
                    name="basketball-outline"
                    size={40}
                    color={colors.textMuted}
                  />
                </View>
                <Text style={styles.emptyTitle}>No court chats yet</Text>
                <Text style={styles.emptyText}>
                  Subscribe to courts on the map to join their group chats here.
                </Text>
                <Pressable
                  style={styles.addFriendsButton}
                  onPress={() => router.push("/(app)/(tabs)/courts")}
                >
                  <Ionicons name="map" size={20} color="#fff" />
                  <Text style={styles.addFriendsButtonText}>Browse courts</Text>
                </Pressable>
              </View>
            }
          />
        )
      ) : (
        <FriendsPanel embedded />
      )}
      </View>

      <NewGroupChatModal
        visible={newGroupOpen}
        onClose={() => setNewGroupOpen(false)}
        onCreated={(conversationId, title) => {
          setNewGroupOpen(false);
          fetchMessageThreads();
          router.push({
            pathname: "/(app)/chat/[conversationId]",
            params: { conversationId, title },
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  headerPlus: {
    padding: spacing.xs,
    marginTop: 2,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  title: {
    color: colors.text,
    ...typography.screenTitle,
  },
  titleAccent: {
    width: 40,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.lg,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
  },
  tabActive: {
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  tabText: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  listHeader: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  courtsListHeader: {
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  courtsListBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    ...shadows.card,
  },
  listHeaderText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  emptyList: {
    flexGrow: 1,
  },
  threadRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadows.soft,
  },
  courtChatRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  courtChatRowLast: {
    marginBottom: 0,
  },
  threadRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    minWidth: 0,
  },
  threadDeleteBtn: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  courtChatIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  courtChatMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  courtChatPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    backgroundColor: "rgba(232, 93, 4, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(232, 93, 4, 0.35)",
  },
  courtChatPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.primaryLight,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  chatItemPreviewEmpty: {
    fontStyle: "italic",
    color: colors.textMuted,
  },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  chatItemPressed: {
    opacity: 0.92,
  },
  chatItemIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chatItemContent: {
    flex: 1,
    minWidth: 0,
  },
  chatItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  chatItemTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  chatItemTime: {
    fontSize: 12,
    color: colors.textMuted,
    flexShrink: 0,
  },
  chatItemPreview: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 19,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginTop: spacing.lg,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: "center",
    lineHeight: 22,
  },
  addFriendsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    ...shadows.soft,
  },
  addFriendsButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
