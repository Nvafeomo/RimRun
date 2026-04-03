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
import { colors, spacing, borderRadius } from "../../../constants/theme";
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

  const fetchCourtChats = useCallback(async () => {
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
        (convs ?? []).map((c) => [c.court_id, c.id])
      );

      const items: CourtChatItem[] = courts.map((court) => ({
        courtId: court.id,
        courtName: court.name ?? "Court",
        conversationId: convByCourt[court.id] ?? "",
      }));

      await Promise.all(
        items.map(async (row) => {
          if (row.conversationId) {
            const { data: lastMsg } = await supabase
              .from("messages")
              .select("content, created_at")
              .eq("conversation_id", row.conversationId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (lastMsg) {
              row.lastMessage = lastMsg.content;
              row.lastMessageAt = lastMsg.created_at;
            }
          } else {
            const { data: newConvId } = await supabase.rpc(
              "get_or_create_court_conversation",
              { p_court_id: row.courtId }
            );
            if (newConvId) row.conversationId = newConvId;
          }
        })
      );

      setCourtChats([...items]);
    } catch (err) {
      console.error("Error fetching court chats:", err);
      setCourtChats([]);
    }
  }, [user?.id]);

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

      const groupItems: MessageThreadItem[] = await Promise.all(
        groupConvs.map(async (c) => {
          const { data: parts } = await supabase
            .from("conversation_participants")
            .select("user_id")
            .eq("conversation_id", c.id);
          const otherIds = (parts ?? [])
            .map((p) => p.user_id)
            .filter((id) => id !== user.id);
          const { data: profs } = await supabase
            .from("profiles")
            .select("username")
            .in("id", otherIds);
          const names = (profs ?? [])
            .map((p) => p.username ?? "?")
            .sort()
            .join(", ");
          const title = c.name?.trim() || names || "Group chat";
          const { data: lastMsg } = await supabase
            .from("messages")
            .select("content, created_at")
            .eq("conversation_id", c.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          return {
            kind: "group" as const,
            conversationId: c.id,
            title,
            lastMessage: lastMsg?.content,
            lastMessageAt: lastMsg?.created_at,
          };
        }),
      );

      const dmItems: MessageThreadItem[] = [];
      if (dmIds.length) {
        const { data: allDmParts } = await supabase
          .from("conversation_participants")
          .select("conversation_id, user_id")
          .in("conversation_id", dmIds);

        const otherByConv = new Map<string, string>();
        for (const cid of dmIds) {
          const parts = (allDmParts ?? []).filter(
            (p) => p.conversation_id === cid,
          );
          const other = parts.find((p) => p.user_id !== user.id);
          if (other) otherByConv.set(cid, other.user_id);
        }
        const otherIds = [...new Set([...otherByConv.values()])];
        const { data: profiles } =
          otherIds.length > 0
            ? await supabase
                .from("profiles")
                .select("id, username")
                .in("id", otherIds)
            : { data: [] as { id: string; username: string | null }[] };
        const nameMap = Object.fromEntries(
          (profiles ?? []).map((p) => [p.id, p.username ?? "Unknown"]),
        );

        for (const cid of dmIds) {
          const otherId = otherByConv.get(cid);
          if (!otherId) continue;
          const { data: lastMsg } = await supabase
            .from("messages")
            .select("content, created_at")
            .eq("conversation_id", cid)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          dmItems.push({
            kind: "dm",
            conversationId: cid,
            otherUserId: otherId,
            otherUsername: nameMap[otherId] ?? "Unknown",
            lastMessage: lastMsg?.content,
            lastMessageAt: lastMsg?.created_at,
          });
        }
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

  /** Refresh when returning from a chat or profile so new DMs appear in the list. */
  useFocusEffect(
    useCallback(() => {
      fetchMessageThreads();
    }, [fetchMessageThreads]),
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

  const openCourtChat = (item: CourtChatItem) => {
    if (!item.conversationId) return;
    router.push({
      pathname: "/(app)/chat/[conversationId]",
      params: {
        conversationId: item.conversationId,
        title: getDisplayName(item.courtId, item.courtName),
        courtId: item.courtId,
        courtName: item.courtName,
      },
    });
  };

  const renderCourtChatItem = ({ item }: { item: CourtChatItem }) => (
    <Pressable
      style={styles.chatItem}
      onPress={() => openCourtChat(item)}
      android_ripple={{ color: colors.border }}
    >
      <View style={styles.chatItemIcon}>
        <Ionicons name="basketball" size={24} color={colors.primary} />
      </View>
      <View style={styles.chatItemContent}>
        <Text style={styles.chatItemTitle} numberOfLines={1}>
          {getDisplayName(item.courtId, item.courtName)}
        </Text>
        <Text style={styles.chatItemPreview} numberOfLines={1}>
          {item.lastMessage ?? "No messages yet"}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );

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
            <Text style={styles.chatItemTitle} numberOfLines={1}>
              {item.kind === "dm" ? item.otherUsername : item.title}
            </Text>
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
            Court
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
            <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
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
            renderItem={renderCourtChatItem}
            keyExtractor={(item) => item.courtId}
            contentContainerStyle={
              courtChats.length === 0 ? styles.emptyList : styles.list
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
                <Ionicons
                  name="basketball-outline"
                  size={48}
                  color={colors.textMuted}
                />
                <Text style={styles.emptyTitle}>No court chats yet</Text>
                <Text style={styles.emptyText}>
                  Subscribe to a court from the Courts tab to see its chat here.
                </Text>
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
    fontSize: 24,
    fontWeight: "600",
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  tabActive: {
    backgroundColor: colors.surface,
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
    padding: spacing.md,
  },
  emptyList: {
    flex: 1,
  },
  threadRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
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
  },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chatItemIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  chatItemContent: {
    flex: 1,
    minWidth: 0,
  },
  chatItemTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  chatItemPreview: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  addFriendsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  addFriendsButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
