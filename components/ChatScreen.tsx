import { useState, useRef, useEffect } from "react";
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
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useConversationChat } from "../hooks/useConversationChat";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../context/ProfileContext";
import { colors, spacing, borderRadius } from "../constants/theme";
import type { Message } from "../types/chat";

type ChatScreenProps = {
  conversationId: string;
  title?: string;
};

export function ChatScreen({ conversationId, title = "Chat" }: ChatScreenProps) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { messages, loading, sending, typingUsers, sendMessage, sendTyping } =
    useConversationChat(conversationId);
  const [inputText, setInputText] = useState("");
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed || sending) return;
    sendMessage(trimmed);
    setInputText("");
  };

  const handleChangeText = (text: string) => {
    setInputText(text);
    sendTyping();
  };

  const typingList = Object.entries(typingUsers)
    .filter(([id]) => id !== user?.id)
    .map(([, name]) => name)
    .join(", ");

  const renderAvatar = (message: Message) => {
    const isOwn = message.sender_id === user?.id;
    const avatarUrl = isOwn
      ? profile?.profile_image_url
      : message.sender?.profile_image_url;
    const displayName = isOwn
      ? (profile?.username ?? "You")
      : (message.sender?.username ?? "Unknown");

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
        <Text style={styles.avatarPlaceholderText}>
          {displayName.charAt(0).toUpperCase()}
        </Text>
      </View>
    );
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwn = item.sender_id === user?.id;
    const displayName = isOwn
      ? (profile?.username ?? "You")
      : (item.sender?.username ?? "Unknown");

    return (
      <View
        style={[
          styles.messageRow,
          isOwn ? styles.messageRowOwn : styles.messageRowOther,
        ]}
      >
        {!isOwn && renderAvatar(item)}
        <View
          style={[
            styles.messageContent,
            isOwn ? styles.messageContentOwn : styles.messageContentOther,
          ]}
        >
          <Text
            style={[
              styles.senderName,
              isOwn ? styles.senderNameOwn : styles.senderNameOther,
            ]}
          >
            {displayName}
          </Text>
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
          </View>
        </View>
        {isOwn && renderAvatar(item)}
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
            <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No messages yet. Say hi!</Text>
          </View>
        }
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor={colors.textMuted}
          value={inputText}
          onChangeText={handleChangeText}
          multiline
          maxLength={2000}
          editable={!sending}
        />
        <Pressable
          onPress={handleSend}
          style={({ pressed }) => [
            styles.sendButton,
            (!inputText.trim() || sending) && styles.sendButtonDisabled,
            pressed && styles.sendButtonPressed,
          ]}
          disabled={!inputText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <Ionicons name="send" size={22} color={colors.text} />
          )}
        </Pressable>
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
  messageList: {
    flexGrow: 1,
    padding: spacing.md,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: spacing.md,
  },
  messageRowOwn: {
    justifyContent: "flex-end",
  },
  messageRowOther: {
    justifyContent: "flex-start",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginHorizontal: spacing.xs,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: spacing.xs,
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
  senderNameOwn: {
    color: colors.primaryLight,
  },
  senderNameOther: {
    color: colors.textSecondary,
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    maxWidth: "100%",
  },
  bubbleOwn: {
    backgroundColor: colors.primary,
  },
  bubbleOther: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageText: {
    fontSize: 15,
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
  },
  emptyText: {
    marginTop: spacing.md,
    fontSize: 16,
    color: colors.textMuted,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: colors.inputBg,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
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
