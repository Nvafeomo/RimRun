import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
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
import { ReportUserModal } from "../../../components/ReportUserModal";
import { supabase } from "../../../lib/supabase";
import { clearConversationAndLeave } from "../../../lib/chatDeletion";
import { useAuth } from "../../../context/AuthContext";
import { useProfile } from "../../../context/ProfileContext";
import { useCourtAliases } from "../../../hooks/useCourtAliases";
import { colors, spacing, borderRadius, shadows } from "../../../constants/theme";
import type { ChatSenderProfile } from "../../../lib/chatSenderProfiles";
import {
  blockUser,
  unblockUser,
  isBlockedUser,
  fetchUserBlockStatus,
  type UserBlockStatus,
} from "../../../lib/blocking";
import { useBlockedUserIds } from "../../../hooks/useBlockedUserIds";

export default function ChatRouteScreen() {
  const { conversationId, title, courtId, courtName, otherUserId } =
    useLocalSearchParams<{
      conversationId: string;
      title?: string;
      courtId?: string;
      courtName?: string;
      otherUserId?: string;
    }>();
  const { user } = useAuth();
  const { refreshProfile } = useProfile();
  const { getDisplayName, refresh } = useCourtAliases();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [chatKind, setChatKind] = useState<"dm" | "group" | "court" | null>(
    null
  );
  /** Other participant in a 1:1 DM (for profile link in header). */
  const [dmOtherUserId, setDmOtherUserId] = useState<string | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockingPartner, setBlockingPartner] = useState(false);
  const [partnerBlockStatus, setPartnerBlockStatus] =
    useState<UserBlockStatus | null>(null);
  const { blockedIds, refresh: refreshBlockedIds } = useBlockedUserIds();
  const displayTitle = title ?? "Chat";
  const resolvedOtherUserId =
    typeof otherUserId === "string"
      ? otherUserId
      : Array.isArray(otherUserId)
        ? otherUserId[0]
        : undefined;
  const dmPeerId = resolvedOtherUserId || dmOtherUserId;

  useFocusEffect(
    useCallback(() => {
      void refreshProfile();
      void refreshBlockedIds();
      if (dmPeerId) {
        void fetchUserBlockStatus(dmPeerId).then(setPartnerBlockStatus);
      }
    }, [refreshProfile, refreshBlockedIds, dmPeerId]),
  );
  const dmPartnerBlockedByMe =
    !!dmPeerId && isBlockedUser(blockedIds, dmPeerId);
  const dmPartnerBlockedByThem = Boolean(partnerBlockStatus?.blockedByThem);
  const dmMessagingBlocked =
    dmPartnerBlockedByMe || dmPartnerBlockedByThem;
  const knownPeers = useMemo((): Record<string, ChatSenderProfile> | undefined => {
    if (!dmPeerId || displayTitle === "Chat") return undefined;
    return {
      [dmPeerId]: {
        username: displayTitle,
        profile_image_url: null,
      },
    };
  }, [dmPeerId, displayTitle]);

  const promptBlockPartner = () => {
    if (!dmPeerId) return;
    const name = displayTitle.trim() || "this user";
    Alert.alert(
      `Block ${name}?`,
      "Their messages will be hidden and this chat will leave your inbox. Unblock later from Friends → Blocked.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => void executeBlockPartner(),
        },
      ],
    );
  };

  const executeBlockPartner = async () => {
    if (!dmPeerId) return;
    setBlockingPartner(true);
    const { error } = await blockUser(dmPeerId);
    setBlockingPartner(false);
    if (error) {
      Alert.alert("Could not block", error.message);
      return;
    }
    await refreshBlockedIds();
    router.back();
  };

  const executeUnblockPartner = async () => {
    if (!dmPeerId) return;
    setBlockingPartner(true);
    const { error } = await unblockUser(dmPeerId);
    setBlockingPartner(false);
    if (error) {
      Alert.alert("Could not unblock", error.message);
      return;
    }
    await refreshBlockedIds();
    if (dmPeerId) {
      setPartnerBlockStatus(await fetchUserBlockStatus(dmPeerId));
    }
  };

  useEffect(() => {
    if (!dmPeerId) {
      setPartnerBlockStatus(null);
      return;
    }
    let cancelled = false;
    void fetchUserBlockStatus(dmPeerId).then((status) => {
      if (!cancelled) setPartnerBlockStatus(status);
    });
    return () => {
      cancelled = true;
    };
  }, [dmPeerId, blockedIds]);

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

  useEffect(() => {
    if (!conversationId || resolvedCourtId) {
      setDmOtherUserId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: conv } = await supabase
        .from("conversations")
        .select("type")
        .eq("id", conversationId)
        .maybeSingle();
      if (cancelled || conv?.type !== "dm" || !user?.id) {
        if (!cancelled) setDmOtherUserId(null);
        return;
      }
      const { data: parts } = await supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", conversationId);
      if (cancelled) return;
      const other = parts?.find((p) => p.user_id !== user.id);
      setDmOtherUserId(other?.user_id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, resolvedCourtId, user?.id]);

  const openDmPartnerProfile = () => {
    if (dmPeerId) {
      router.push(`/(app)/user/${dmPeerId}`);
    }
  };

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

        {isCourtChat ? (
          <Pressable
            onPress={goToCourt}
            style={styles.headerTitleBlock}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open court details"
          >
            <Text style={styles.headerTitle} numberOfLines={1}>
              {displayTitle}
            </Text>
            <View style={styles.headerSubtitleRow}>
              <Ionicons name="basketball" size={12} color={colors.primary} />
              <Text style={styles.headerSubtitle}>Court chat</Text>
            </View>
          </Pressable>
        ) : dmPeerId ? (
          <Pressable
            onPress={openDmPartnerProfile}
            style={styles.headerTitleBlock}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            <Text style={styles.headerTitle} numberOfLines={1}>
              {displayTitle}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {displayTitle}
            </Text>
          </View>
        )}

        <View style={styles.headerActions}>
          {dmPeerId && !dmMessagingBlocked && chatKind === "dm" && (
            <Pressable
              hitSlop={10}
              onPress={promptBlockPartner}
              style={styles.headerIconButton}
              accessibilityLabel="Block user"
              disabled={blockingPartner}
            >
              <Ionicons name="ban-outline" size={20} color={colors.textMuted} />
            </Pressable>
          )}
          {(!!dmPeerId || isCourtChat) && (
            <Pressable
              hitSlop={10}
              onPress={() => setReportOpen(true)}
              style={styles.headerIconButton}
              accessibilityLabel="Report"
            >
              <Ionicons name="flag-outline" size={20} color={colors.textMuted} />
            </Pressable>
          )}
          {isCourtChat && (
            <Pressable
              hitSlop={10}
              onPress={goToCourt}
              style={styles.headerIconButton}
              accessibilityLabel="Court details"
            >
              <Ionicons
                name="information-circle-outline"
                size={22}
                color={colors.primary}
              />
            </Pressable>
          )}
          {canRename && (
            <Pressable
              hitSlop={10}
              onPress={openRename}
              style={styles.headerIconButton}
              accessibilityLabel="Rename court chat"
            >
              <Ionicons name="pencil-outline" size={20} color={colors.textMuted} />
            </Pressable>
          )}
          {showDmGroupActions && (
            <Pressable
              hitSlop={10}
              onPress={() => setAddMemberOpen(true)}
              style={styles.headerIconButton}
              accessibilityLabel="Add member"
            >
              <Ionicons name="person-add-outline" size={20} color={colors.primary} />
            </Pressable>
          )}
          {showDmGroupActions && (
            <Pressable
              hitSlop={10}
              onPress={handleDeleteConversation}
              style={styles.headerIconButton}
              accessibilityLabel="Delete conversation"
            >
              <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {isCourtChat ? (
        <Pressable
          style={styles.courtChatStrip}
          onPress={goToCourt}
          accessibilityRole="button"
          accessibilityLabel="Open court details"
        >
          <View style={styles.courtChatStripIcon}>
            <Ionicons name="basketball" size={16} color={colors.primary} />
          </View>
          <Text style={styles.courtChatStripText} numberOfLines={1}>
            Group chat for court subscribers
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {dmMessagingBlocked ? (
        <View style={styles.blockedChatBanner}>
          <Ionicons
            name={dmPartnerBlockedByThem ? "hand-left-outline" : "eye-off-outline"}
            size={18}
            color={colors.textSecondary}
          />
          <Text style={styles.blockedChatBannerText}>
            {dmPartnerBlockedByThem
              ? `${displayTitle} has you blocked. You can't send messages.`
              : `You blocked ${displayTitle}. Their messages are hidden.`}
          </Text>
          {dmPartnerBlockedByMe ? (
            <Pressable
              onPress={() => void executeUnblockPartner()}
              disabled={blockingPartner}
              hitSlop={8}
            >
              <Text style={styles.blockedChatUnblock}>
                {blockingPartner ? "…" : "Unblock"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <ChatScreen
        conversationId={conversationId}
        title={displayTitle}
        knownPeers={knownPeers}
        composerLocked={dmMessagingBlocked}
        composerLockedMessage={
          dmPartnerBlockedByThem
            ? "This person has you blocked."
            : dmPartnerBlockedByMe
              ? `Unblock ${displayTitle} to send messages.`
              : undefined
        }
      />

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

      <ReportUserModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        reportedUserId={dmPeerId}
        conversationId={conversationId}
        courtId={resolvedCourtId || null}
        contextLabel={
          isCourtChat
            ? `Court chat: ${displayTitle}`
            : `Direct chat with ${displayTitle}`
        }
      />

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
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  backButton: {
    padding: spacing.sm,
  },
  headerTitleBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
  },
  headerSubtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primaryLight,
    letterSpacing: 0.2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  headerIconButton: {
    padding: spacing.sm,
  },
  courtChatStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  courtChatStripIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  blockedChatBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  blockedChatBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  blockedChatUnblock: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
  },
  courtChatStripText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: colors.textSecondary,
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
