import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import { useCourtAliases } from "../../../hooks/useCourtAliases";
import { colors, spacing, borderRadius } from "../../../constants/theme";

type CourtChatItem = {
  courtId: string;
  courtName: string;
  conversationId: string;
  lastMessage?: string;
  lastMessageAt?: string;
};

export default function ChatsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { getDisplayName } = useCourtAliases();
  const [activeTab, setActiveTab] = useState<"courts" | "messages">("messages");
  const [courtChats, setCourtChats] = useState<CourtChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

      for (let i = 0; i < items.length; i++) {
        if (items[i].conversationId) {
          const { data: lastMsg } = await supabase
            .from("messages")
            .select("content, created_at")
            .eq("conversation_id", items[i].conversationId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (lastMsg) {
            items[i].lastMessage = lastMsg.content;
            items[i].lastMessageAt = lastMsg.created_at;
          }
        } else {
          const { data: newConvId } = await supabase.rpc(
            "get_or_create_court_conversation",
            { p_court_id: items[i].courtId }
          );
          if (newConvId) items[i].conversationId = newConvId;
        }
      }

      setCourtChats(items);
    } catch (err) {
      console.error("Error fetching court chats:", err);
      setCourtChats([]);
    }
  }, [user?.id]);

  useEffect(() => {
    setLoading(true);
    fetchCourtChats().finally(() => setLoading(false));
  }, [fetchCourtChats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchCourtChats();
    setRefreshing(false);
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Chats</Text>
        <Text style={styles.subtitle}>
          {activeTab === "courts"
            ? "Court chats for your subscribed courts"
            : "Direct and group messages"}
        </Text>
      </View>

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === "messages" && styles.tabActive]}
          onPress={() => setActiveTab("messages")}
        >
          <Ionicons
            name="chatbubbles"
            size={20}
            color={activeTab === "messages" ? colors.primary : colors.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === "messages" && styles.tabTextActive,
            ]}
          >
            Messages
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "courts" && styles.tabActive]}
          onPress={() => {
            setActiveTab("courts");
            fetchCourtChats();
          }}
        >
          <Ionicons
            name="basketball"
            size={20}
            color={activeTab === "courts" ? colors.primary : colors.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === "courts" && styles.tabTextActive,
            ]}
          >
            Court Chats
          </Text>
        </Pressable>
      </View>

      {activeTab === "messages" ? (
        <View style={styles.emptyState}>
          <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptyText}>
            Direct messages and group chats will appear here.
          </Text>
        </View>
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
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
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
});
