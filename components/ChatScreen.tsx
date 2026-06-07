import { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useConversationChat } from "../hooks/useConversationChat";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../context/ProfileContext";
import { AvatarImage } from "./AvatarImage";
import { colors, spacing, borderRadius } from "../constants/theme";
import { checkMessageClient } from "../lib/chatModeration";
import { canEditMessage, canUnsendMessage } from "../lib/chatMessageActions";
import type { Message } from "../types/chat";

type ChatScreenProps = {
  conversationId: string;
  title?: string;
};

/** First letter for avatar placeholder: username, else optional email local part, else "?". */
function avatarPlaceholderLetter(
  username: string | null | undefined,
  emailLocalPart?: string | null
): string {
  const u = username?.trim();
  if (u) return u.charAt(0).toUpperCase();
  const e = emailLocalPart?.trim();
  if (e) return e.charAt(0).toUpperCase();
  return "?";
}

export function ChatScreen({ conversationId, title = "Chat" }: ChatScreenProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useProfile();
  const {
    messages,
    loading,
    messagesLoadFailed,
    retryLoadMessages,
    sending,
    typingUsers,
    sendMessage,
    editMessage,
    unsendMessage,
    sendTyping,
  } = useConversationChat(conversationId);
  const [inputText, setInputText] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const cancelEditing = () => {
    setEditingMessage(null);
    setInputText("");
    setSendError(null);
  };

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || sending) return;

    setSendError(null);

    const clientCheck = checkMessageClient(trimmed);
    if (clientCheck.blocked) {
      setSendError(clientCheck.reason);
      return;
    }

    if (editingMessage) {
      const result = await editMessage(editingMessage.id, trimmed);
      if (!result.ok) {
        setSendError(
          result.blocked
            ? result.reason ?? "Message blocked."
            : result.error ?? "Could not edit message.",
        );
        return;
      }
      cancelEditing();
      return;
    }

    const result = await sendMessage(trimmed);
    if (!result.ok) {
      setSendError(
        result.blocked
          ? result.reason
          : result.error ?? "Could not send message.",
      );
      return;
    }

    setInputText("");
    setSendError(null);
  };

  const openMessageActions = (message: Message) => {
    if (message.sender_id !== user?.id || message.deleted_at) return;

    const buttons: {
      text: string;
      onPress?: () => void;
      style?: "cancel" | "destructive" | "default";
    }[] = [];

    if (canEditMessage(message)) {
      buttons.push({
        text: "Edit",
        onPress: () => {
          setEditingMessage(message);
          setInputText(message.content);
          setSendError(null);
        },
      });
    }

    if (canUnsendMessage(message)) {
      buttons.push({
        text: "Unsend",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const result = await unsendMessage(message.id);
            if (!result.ok) {
              setSendError(result.error ?? "Could not unsend message.");
            }
            if (editingMessage?.id === message.id) {
              cancelEditing();
            }
          })();
        },
      });
    }

    buttons.push({ text: "Cancel", style: "cancel" });

    Alert.alert("Message", undefined, buttons);
  };

  const handleChangeText = (text: string) => {
    setInputText(text);
    if (sendError) {
      setSendError(null);
    }
    sendTyping();
  };

  const openSenderProfile = (senderId: string) => {
    if (!senderId) return;
    if (senderId === user?.id) {
      router.push("/(app)/(tabs)/profile");
      return;
    }
    router.push(`/(app)/user/${senderId}`);
  };

  const typingList = Object.entries(typingUsers)
    .filter(([id]) => id !== user?.id)
    .map(([, name]) => name)
    .join(", ");

  const chatSuspended =
    !!profile?.chat_suspended_until &&
    new Date(profile.chat_suspended_until).getTime() > Date.now();

  const renderAvatar = (avatarUrl: string | null, placeholderLetter: string) => {
    if (avatarUrl) {
      return (
        <Image
          source={{ uri: avatarUrl }}
          style={styles.avatar}
          contentFit="cover"
        />
      );
    }
    return (
      <View style={styles.avatarPlaceholder}>
        <Text style={styles.avatarPlaceholderText}>{placeholderLetter}</Text>
      </View>
    );
  };

  const renderMessageBubble = (
    item: Message,
    isOwn: boolean,
  ) => {
    if (item.deleted_at) {
      return (
        <View
          style={[
            styles.bubble,
            isOwn ? styles.bubbleOwn : styles.bubbleOther,
            styles.bubbleDeleted,
          ]}
        >
          <Ionicons name="trash-outline" size={13} color={colors.textMuted} />
          <Text style={styles.deletedText}>Message deleted</Text>
        </View>
      );
    }

    return (
      <Pressable
        onLongPress={() => isOwn && openMessageActions(item)}
        delayLongPress={350}
        disabled={!isOwn}
      >
        <View
          style={[
            styles.bubble,
            isOwn ? styles.bubbleOwn : styles.bubbleOther,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isOwn ? styles.messageTextOwn : styles.messageTextOther,
            ]}
          >
            {item.content}
          </Text>
          {item.edited_at ? (
            <Text
              style={[
                styles.editedTag,
                isOwn ? styles.editedTagOwn : styles.editedTagOther,
              ]}
            >
              (edited)
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwn = item.sender_id === user?.id;
    const displayName = isOwn
      ? (profile?.username ?? "You")
      : (item.sender?.username ?? "Unknown");

    if (isOwn) {
      const avatarUrl = profile?.profile_image_url;
      const avatarLetter = avatarPlaceholderLetter(
        profile?.username,
        user?.email?.split("@")[0] ?? null
      );
      return (
        <View style={[styles.messageRow, styles.messageRowOwn]}>
          <View style={[styles.messageContent, styles.messageContentOwn]}>
            <Pressable onPress={() => openSenderProfile(user?.id ?? "")}>
              <Text style={[styles.senderName, styles.senderNameOwn]}>
                {displayName}
              </Text>
            </Pressable>
            {renderMessageBubble(item, true)}
          </View>
          <Pressable
            style={styles.avatarColumn}
            onPress={() => openSenderProfile(user?.id ?? "")}
            hitSlop={8}
            accessibilityLabel="Open your profile"
          >
            {renderAvatar(avatarUrl ?? null, avatarLetter)}
          </Pressable>
        </View>
      );
    }

    return (
      <View style={[styles.messageRow, styles.messageRowOther]}>
        <Pressable
          style={styles.avatarColumn}
          onPress={() => openSenderProfile(item.sender_id)}
          hitSlop={8}
          accessibilityLabel={`Open ${displayName}'s profile`}
        >
          <Text
            style={[
              styles.senderName,
              styles.senderNameOther,
              styles.senderNameInColumn,
            ]}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          <AvatarImage
            userId={item.sender_id}
            username={item.sender?.username}
            profileImageUrl={item.sender?.profile_image_url}
            size={36}
          />
        </Pressable>
        <View style={[styles.messageContent, styles.messageContentOther]}>
          {renderMessageBubble(item, false)}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (messagesLoadFailed) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadErrorTitle}>Couldn&apos;t load messages</Text>
        <Text style={styles.loadErrorBody}>Check your connection and try again.</Text>
        <Pressable style={styles.loadErrorButton} onPress={() => void retryLoadMessages()}>
          <Text style={styles.loadErrorButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {typingList ? (
        <View style={styles.typingBar}>
          <Text style={styles.typingText} numberOfLines={1}>
            {typingList} {typingList.includes(",") ? "are" : "is"} typing...
          </Text>
        </View>
      ) : null}

      {chatSuspended ? (
        <View style={styles.suspensionBanner}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
          <Text style={styles.suspensionBannerText}>
            Sending messages is temporarily limited on your account.
          </Text>
        </View>
      ) : null}

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons
                name="chatbubbles-outline"
                size={40}
                color={colors.textMuted}
              />
            </View>
            <Text style={styles.emptyTitle}>Start the conversation</Text>
            <Text style={styles.emptyText}>
              Say hi — messages appear here for everyone in this chat.
            </Text>
          </View>
        }
      />

      {sendError ? (
        <View style={styles.sendErrorBar}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.sendErrorText}>{sendError}</Text>
          <Pressable onPress={() => setSendError(null)} hitSlop={8}>
            <Ionicons name="close" size={16} color={colors.error} />
          </Pressable>
        </View>
      ) : null}

      {editingMessage ? (
        <View style={styles.editingBar}>
          <Ionicons name="pencil" size={16} color={colors.primary} />
          <Text style={styles.editingBarText} numberOfLines={1}>
            Editing: {editingMessage.content}
          </Text>
          <Pressable onPress={cancelEditing} hitSlop={8}>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.inputBar}>
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder={editingMessage ? "Edit message..." : "Message…"}
            placeholderTextColor={colors.textMuted}
            value={inputText}
            onChangeText={handleChangeText}
            multiline
            maxLength={2000}
            editable={!sending && !chatSuspended}
          />
          <Pressable
            onPress={handleSend}
            style={({ pressed }) => [
              styles.sendButton,
              (!inputText.trim() || sending || chatSuspended) &&
                styles.sendButtonDisabled,
              pressed && styles.sendButtonPressed,
            ]}
            disabled={!inputText.trim() || sending || chatSuspended}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Ionicons
                name={editingMessage ? "checkmark" : "send"}
                size={20}
                color={colors.text}
              />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  loadErrorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  loadErrorBody: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  loadErrorButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  loadErrorButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  typingBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  typingText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  suspensionBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suspensionBannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  messageList: {
    flexGrow: 1,
    padding: spacing.md,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: spacing.sm + 2,
  },
  messageRowOwn: {
    justifyContent: "flex-end",
  },
  messageRowOther: {
    alignItems: "flex-start",
  },
  avatarColumn: {
    width: 44,
    alignItems: "center",
    marginHorizontal: spacing.xs,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPlaceholderText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  messageContent: {
    maxWidth: "75%",
    alignItems: "flex-start",
  },
  messageContentOwn: {
    alignItems: "flex-end",
  },
  messageContentOther: {
    alignItems: "flex-start",
  },
  senderName: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  senderNameInColumn: {
    marginBottom: 2,
    textAlign: "center",
    width: "100%",
  },
  senderNameOwn: {
    color: colors.primaryLight,
  },
  senderNameOther: {
    color: colors.textSecondary,
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.lg,
    maxWidth: "100%",
  },
  bubbleOwn: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: borderRadius.sm,
  },
  bubbleOther: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: borderRadius.sm,
  },
  bubbleDeleted: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderStyle: "dashed",
    opacity: 0.85,
  },
  deletedText: {
    fontSize: 13,
    fontStyle: "italic",
    color: colors.textMuted,
  },
  editedTag: {
    fontSize: 11,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  editedTagOwn: {
    color: "rgba(255,255,255,0.75)",
  },
  editedTagOther: {
    color: colors.textMuted,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  messageTextOwn: {
    color: colors.text,
  },
  messageTextOther: {
    color: colors.text,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: spacing.xl * 2,
    paddingHorizontal: spacing.xl,
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
    marginTop: spacing.lg,
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  emptyText: {
    marginTop: spacing.sm,
    fontSize: 15,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  sendErrorBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.28)",
  },
  sendErrorText: {
    flex: 1,
    fontSize: 13,
    color: colors.error,
    lineHeight: 18,
  },
  editingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editingBarText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
  },
  inputBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 0,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonPressed: {
    opacity: 0.8,
  },
});
