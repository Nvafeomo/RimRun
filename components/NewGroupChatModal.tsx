import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { colors, spacing, borderRadius } from "../constants/theme";

type FriendRow = {
  id: string;
  username: string | null;
  profile_image_url: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Navigate to the new group thread */
  onCreated: (conversationId: string, title: string) => void;
};

export function NewGroupChatModal({ visible, onClose, onCreated }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadFriends = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data: links } = await supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", user.id);
    if (!links?.length) {
      setFriends([]);
      setLoading(false);
      return;
    }
    const ids = links.map((l) => l.friend_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, profile_image_url")
      .in("id", ids);
    setFriends(
      (profiles ?? []).map((p) => ({
        id: p.id,
        username: p.username,
        profile_image_url: p.profile_image_url,
      }))
    );
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (visible) {
      loadFriends();
      setSelected(new Set());
      setQuery("");
    }
  }, [visible, loadFriends]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createGroup = async () => {
    if (!user?.id || selected.size < 2) {
      Alert.alert("Select friends", "Choose at least two friends for a group chat.");
      return;
    }
    setCreating(true);
    const p_friend_ids = Array.from(selected);
    const { data: convId, error } = await supabase.rpc("create_group_conversation", {
      p_friend_ids,
    });
    setCreating(false);
    if (error || !convId) {
      Alert.alert(
        "Could not create group",
        error?.message ?? "Something went wrong."
      );
      return;
    }
    const title = await buildGroupTitle([user.id, ...p_friend_ids]);
    onClose();
    onCreated(convId as string, title);
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? friends.filter((f) => (f.username ?? "").toLowerCase().includes(q))
    : friends;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.safeRoot,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>New group chat</Text>
          <Pressable
            onPress={createGroup}
            disabled={creating || selected.size < 2}
            style={[
              styles.primaryBtn,
              (creating || selected.size < 2) && styles.primaryBtnDisabled,
            ]}
          >
            {creating ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>Create</Text>
            )}
          </Pressable>
        </View>
        <Text style={styles.hint}>Select at least two friends.</Text>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Filter by name"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
        </View>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            style={styles.listFlex}
            contentContainerStyle={styles.list}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            ListEmptyComponent={
              <Text style={styles.empty}>No friends match. Add friends first.</Text>
            }
            renderItem={({ item }) => {
              const on = selected.has(item.id);
              return (
                <Pressable
                  style={[styles.row, on && styles.rowOn]}
                  onPress={() => toggle(item.id)}
                >
                  {item.profile_image_url ? (
                    <Image
                      source={{ uri: item.profile_image_url }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={styles.avatarPh}>
                      <Text style={styles.avatarTx}>
                        {(item.username ?? "?")[0].toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.name} numberOfLines={1}>
                    {item.username ?? "Unknown"}
                  </Text>
                  <Ionicons
                    name={on ? "checkbox" : "square-outline"}
                    size={22}
                    color={on ? colors.primary : colors.textMuted}
                  />
                </Pressable>
              );
            }}
          />
        )}
      </View>
      </View>
    </Modal>
  );
}

async function buildGroupTitle(userIds: string[]): Promise<string> {
  if (userIds.length === 0) return "Group chat";
  const { data } = await supabase
    .from("profiles")
    .select("username")
    .in("id", userIds);
  const names = (data ?? [])
    .map((r) => r.username?.trim() || "?")
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return names.length ? names.join(", ") : "Group chat";
}

const styles = StyleSheet.create({
  safeRoot: {
    flex: 1,
    backgroundColor: colors.background,
  },
  sheet: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.background,
  },
  listFlex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  iconBtn: { padding: spacing.xs },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  primaryBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    minWidth: 80,
    alignItems: "center",
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: "#fff", fontWeight: "600" },
  hint: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    color: colors.textMuted,
    fontSize: 14,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    margin: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
  },
  list: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  rowOn: { borderColor: colors.primary },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPh: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTx: { fontSize: 18, fontWeight: "600", color: colors.textSecondary },
  name: { flex: 1, fontSize: 16, fontWeight: "600", color: colors.text },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: {
    textAlign: "center",
    color: colors.textMuted,
    marginTop: spacing.xl,
  },
});
