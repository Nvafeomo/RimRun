import { useState, useEffect } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Pressable,
  Text,
  TextInput,
  Modal,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ChatScreen } from "../../../components/ChatScreen";
import { AddMemberToChatModal } from "../../../components/AddMemberToChatModal";
import { supabase } from "../../../lib/supabase";
import { clearConversationAndLeave } from "../../../lib/chatDeletion";
import { useAuth } from "../../../context/AuthContext";
import { useCourtAliases } from "../../../hooks/useCourtAliases";
import { colors, spacing, borderRadius } from "../../../constants/theme";

export default function ChatRouteScreen() {
  const { conversationId, title, courtId, courtName } = useLocalSearchParams<{
    conversationId: string;
    title?: string;
    courtId?: string;
    courtName?: string;
  }>();
  const { user } = useAuth();
  const { getDisplayName, refresh } = useCourtAliases();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [chatKind, setChatKind] = useState<"dm" | "group" | "court" | null>(
    null
  );
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const displayTitle = title ?? "Chat";
  const resolvedCourtId = courtId ?? "";
  const resolvedCourtName = courtName ?? "Court";
  const canRename = !!resolvedCourtId && !!user?.id;
  const isCourtChat = !!resolvedCourtId;
  const showDmGroupActions =
    !isCourtChat && (chatKind === "dm" || chatKind === "group");

  const handleDeleteConversation = () => {
    if (!conversationId || !user?.id) return;
    const name = displayTitle;
    Alert.alert(
      chatKind === "group" ? "Delete group chat?" : "Delete conversation?",
      chatKind === "group"
        ? `This deletes all messages in "${name}" for everyone and removes you from the group.`
        : `This deletes all messages with ${name} and removes the chat from your list. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void runDeleteConversation(),
        },
      ]
    );
  };

  const runDeleteConversation = async () => {
    if (!conversationId || !user?.id) return;
    const { error } = await clearConversationAndLeave(conversationId, user.id);
    if (error) {
      Alert.alert("Could not delete", error.message);
      return;
    }
    router.back();
  };

  useEffect(() => {
    if (!conversationId) return;
    if (resolvedCourtId) {
      setChatKind("court");
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("conversations")
        .select("type")
        .eq("id", conversationId)
        .maybeSingle();
      if (cancelled) return;
      const t = data?.type as string | undefined;
      if (t === "dm" || t === "group") setChatKind(t);
      else setChatKind(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, resolvedCourtId]);

  const openRename = () => {
    setEditName(getDisplayName(resolvedCourtId, resolvedCourtName));
    setEditing(true);
  };

  const goToCourt = () => {
    if (resolvedCourtId) {
      router.push({
        pathname: "/(app)/court/[courtId]",
        params: { courtId: resolvedCourtId },
      });
    }
  };

  const saveAlias = async () => {
    if (!resolvedCourtId || !user?.id) return;
    const trimmed = editName.trim();
    if (!trimmed) return;
    try {
      if (trimmed === resolvedCourtName) {
        await supabase
          .from("user_court_aliases")
          .delete()
          .eq("user_id", user.id)
          .eq("court_id", resolvedCourtId);
      } else {
        await supabase.from("user_court_aliases").upsert(
          {
            user_id: user.id,
            court_id: resolvedCourtId,
            custom_name: trimmed,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,court_id" }
        );
      }
      setEditing(false);
      await refresh();
      router.setParams({ title: trimmed });
    } catch (err) {
      console.error("Error saving alias:", err);
      Alert.alert("Error", "Could not save name.");
    }
  };

  if (!conversationId) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {displayTitle}
          </Text>
          {isCourtChat && (
            <Pressable
              hitSlop={12}
              onPress={goToCourt}
              style={styles.headerIconButton}
            >
              <Ionicons name="location" size={20} color={colors.primary} />
            </Pressable>
          )}
          {canRename && (
            <Pressable
              hitSlop={12}
              onPress={openRename}
              style={styles.headerEditButton}
            >
              <Ionicons name="pencil" size={18} color={colors.textMuted} />
            </Pressable>
          )}
          {showDmGroupActions && (
            <Pressable
              hitSlop={12}
              onPress={handleDeleteConversation}
              style={styles.headerIconButton}
              accessibilityLabel="Delete conversation"
            >
              <Ionicons name="trash-outline" size={22} color={colors.textMuted} />
            </Pressable>
          )}
          {showDmGroupActions && (
            <Pressable
              hitSlop={12}
              onPress={() => setAddMemberOpen(true)}
              style={styles.headerIconButton}
            >
              <Ionicons name="person-add-outline" size={22} color={colors.primary} />
            </Pressable>
          )}
        </View>
      </View>
      <ChatScreen conversationId={conversationId} title={displayTitle} />

      <Modal
        visible={editing}
        transparent
        animationType="fade"
        onRequestClose={() => setEditing(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setEditing(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalContent}
          >
            <Pressable onPress={() => {}} style={styles.modalCard}>
              <Text style={styles.modalTitle}>Rename court chat</Text>
              <TextInput
                style={styles.modalInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Court name"
                placeholderTextColor={colors.textMuted}
                autoFocus
                autoCapitalize="words"
              />
              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalCancel}
                  onPress={() => setEditing(false)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalSave,
                    !editName.trim() && styles.modalSaveDisabled,
                  ]}
                  onPress={saveAlias}
                  disabled={!editName.trim()}
                >
                  <Text style={styles.modalSaveText}>Save</Text>
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {showDmGroupActions && chatKind && (
        <AddMemberToChatModal
          visible={addMemberOpen}
          onClose={() => setAddMemberOpen(false)}
          conversationId={conversationId}
          chatType={chatKind}
          onPromotedToGroup={(newConversationId, newTitle) => {
            setAddMemberOpen(false);
            router.replace({
              pathname: "/(app)/chat/[conversationId]",
              params: {
                conversationId: newConversationId,
                title: newTitle,
              },
            });
          }}
          onMemberAdded={() => setAddMemberOpen(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.sm,
    marginRight: spacing.sm,
  },
  headerTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    gap: spacing.xs,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  headerIconButton: {
    padding: spacing.xs,
  },
  headerEditButton: {
    padding: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  modalContent: {
    width: "100%",
    maxWidth: 360,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.md,
  },
  modalInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "flex-end",
  },
  modalCancel: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  modalCancelText: {
    fontSize: 16,
    color: colors.textMuted,
  },
  modalSave: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  modalSaveDisabled: {
    opacity: 0.5,
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
