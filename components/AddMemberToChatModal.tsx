import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { colors, spacing, borderRadius } from "../constants/theme";
import { AvatarImage } from "./AvatarImage";

type FriendRow = {
  id: string;
  username: string | null;
  profile_image_url: string | null;
};

export type AddMemberChatType = "dm" | "group";

type Props = {
  visible: boolean;
  onClose: () => void;
  conversationId: string;
  chatType: AddMemberChatType;
  /** DM upgraded to group: new conversation id + title */
  onPromotedToGroup?: (newConversationId: string, title: string) => void;
  /** Member added to existing group (same conversation) */
  onMemberAdded?: () => void;
};

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

export function AddMemberToChatModal({
  visible,
  onClose,
  conversationId,
  chatType,
  onPromotedToGroup,
  onMemberAdded,
}: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [participantIds, setParticipantIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !conversationId) return;
    setLoading(true);
    const [{ data: links }, { data: parts }] = await Promise.all([
      supabase.from("friendships").select("friend_id").eq("user_id", user.id),
      supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", conversationId),
    ]);
    const inConv = new Set((parts ?? []).map((p) => p.user_id));
    setParticipantIds(inConv);

    const ids = (links ?? []).map((l) => l.friend_id).filter((id) => !inConv.has(id));
    if (!ids.length) {
      setFriends([]);
      setLoading(false);
      return;
    }
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
  }, [user?.id, conversationId]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const addFriend = (friendId: string) => {
    Alert.alert(
      "Add to chat",
      "They will not see messages sent before they join.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Add",
          onPress: async () => {
            setWorkingId(friendId);
            if (chatType === "dm") {
              const { data: newId, error } = await supabase.rpc(
                "create_group_from_dm_with_new_member",
                {
                  p_dm_conversation_id: conversationId,
                  p_new_user_id: friendId,
                }
              );
              setWorkingId(null);
              if (error || !newId || !user?.id) {
                Alert.alert(
                  "Could not create group",
                  error?.message ?? "Something went wrong."
                );
                return;
              }
              const others = Array.from(participantIds).filter((id) => id !== user.id);
              const title = await buildGroupTitle([user.id, ...others, friendId]);
              onClose();
              onPromotedToGroup?.(newId as string, title);
            } else {
              const { error } = await supabase.rpc("add_group_member", {
                p_conversation_id: conversationId,
                p_new_user_id: friendId,
              });
              setWorkingId(null);
              if (error) {
                Alert.alert(
                  "Could not add member",
                  error.message ?? "Something went wrong."
                );
                return;
              }
              onClose();
              onMemberAdded?.();
            }
          },
        },
      ]
    );
  };

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
          <Text style={styles.title}>
            {chatType === "dm" ? "Add friend (new group)" : "Add to group"}
          </Text>
          <View style={{ width: 34 }} />
        </View>
        <Text style={styles.sub}>
          {chatType === "dm"
            ? "Starts a new group with you, your friend, and the person you pick."
            : "New members cannot see earlier messages."}
        </Text>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : friends.length === 0 ? (
          <Text style={styles.empty}>
            No friends left to add. Everyone here is already in this chat, or you
            need more friends.
          </Text>
        ) : (
          <FlatList
            data={friends}
            keyExtractor={(item) => item.id}
            style={styles.listFlex}
            contentContainerStyle={styles.list}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            renderItem={({ item }) => {
              const busy = workingId === item.id;
              return (
                <Pressable
                  style={styles.row}
                  onPress={() => !busy && addFriend(item.id)}
                  disabled={!!workingId}
                >
                  <AvatarImage
                    userId={item.id}
                    username={item.username}
                    profileImageUrl={item.profile_image_url}
                    size={44}
                  />
                  <Text style={styles.name} numberOfLines={1}>
                    {item.username ?? "Unknown"}
                  </Text>
                  {busy ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Ionicons name="add-circle" size={26} color={colors.primary} />
                  )}
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
  },
  iconBtn: { padding: spacing.xs, marginRight: spacing.sm },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  sub: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
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
    padding: spacing.lg,
    color: colors.textMuted,
    fontSize: 15,
    textAlign: "center",
  },
});
