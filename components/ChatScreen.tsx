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
import { AvatarImage } from "./AvatarImage";
import { colors, spacing, borderRadius } from "../constants/theme";
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
            <Text style={[styles.senderName, styles.senderNameOwn]}>
              {displayName}
            </Text>
            <View style={[styles.bubble, styles.bubbleOwn]}>
              <Text style={[styles.messageText, styles.messageTextOwn]}>
                {item.content}
              </Text>
            </View>
          </View>
          <View style={styles.avatarColumn}>
            {renderAvatar(avatarUrl ?? null, avatarLetter)}
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.messageRow, styles.messageRowOther]}>
        <View style={styles.avatarColumn}>
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
        </View>
        <View style={[styles.messageContent, styles.messageContentOther]}>
          <View style={[styles.bubble, styles.bubbleOther]}>
            <Text style={[styles.messageText, styles.messageTextOther]}>
              {item.content}
            </Text>
          </View>
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
