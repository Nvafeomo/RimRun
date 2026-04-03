import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { AvatarImage } from "./AvatarImage";
import { removeFriendship } from "../lib/friendshipActions";
import { blockUser, unblockUser } from "../lib/blocking";
import { useAuth } from "../context/AuthContext";
import { colors, spacing, borderRadius } from "../constants/theme";

export type ProfileRow = {
  id: string;
  username: string | null;
  profile_image_url: string | null;
};

type FriendRequestRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  created_at: string;
  other_user: ProfileRow;
  direction: "incoming" | "outgoing";
};

type FriendRow = {
  id: string;
  friend: ProfileRow;
};

export type FriendsPanelProps = {
  /** When true, panel is embedded under Chats (no stack header). */
  embedded?: boolean;
};

export function FriendsPanel({ embedded = false }: FriendsPanelProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [friendSubTab, setFriendSubTab] = useState<
    "all" | "requests" | "add" | "blocked"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [requests, setRequests] = useState<FriendRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<ProfileRow[]>([]);

  const incomingCount = useMemo(
    () => requests.filter((r) => r.direction === "incoming").length,
    [requests]
  );

  const fetchFriends = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", user.id);
    if (!data?.length) {
      setFriends([]);
      return;
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, profile_image_url")
      .in("id", data.map((r) => r.friend_id));
    setFriends(
      (profiles ?? []).map((p) => ({
        id: p.id,
        friend: {
          id: p.id,
          username: p.username,
          profile_image_url: p.profile_image_url,
        },
      }))
    );
  }, [user?.id]);

  const fetchBlocked = useCallback(async () => {
    if (!user?.id) return;
    const { data: rows } = await supabase
      .from("user_blocks")
      .select("blocked_id")
      .eq("blocker_id", user.id)
      .order("created_at", { ascending: false });
    if (!rows?.length) {
      setBlockedUsers([]);
      return;
    }
    const ids = rows.map((r) => r.blocked_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, profile_image_url")
      .in("id", ids);
    const order = new Map(ids.map((id, i) => [id, i]));
    setBlockedUsers(
      (profiles ?? []).sort(
        (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
      ),
    );
  }, [user?.id]);

  const fetchRequests = useCallback(async () => {
    if (!user?.id) return;
    const { data: sent } = await supabase
      .from("friend_requests")
      .select("id, sender_id, receiver_id, status, created_at")
      .eq("sender_id", user.id)
      .eq("status", "pending");
    const { data: received } = await supabase
      .from("friend_requests")
      .select("id, sender_id, receiver_id, status, created_at")
      .eq("receiver_id", user.id)
      .eq("status", "pending");
    const rows: FriendRequestRow[] = [];
    const otherIds: string[] = [];
    (sent ?? []).forEach((r) => {
      otherIds.push(r.receiver_id);
      rows.push({
        ...r,
        other_user: {
          id: r.receiver_id,
          username: null,
          profile_image_url: null,
        },
        direction: "outgoing",
      });
    });
    (received ?? []).forEach((r) => {
      otherIds.push(r.sender_id);
      rows.push({
        ...r,
        other_user: {
          id: r.sender_id,
          username: null,
          profile_image_url: null,
        },
        direction: "incoming",
      });
    });
    if (otherIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, profile_image_url")
        .in("id", otherIds);
      const map = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
      rows.forEach((r) => {
        const p = map[r.other_user.id];
        if (p) r.other_user = p;
      });
    }
    setRequests(rows);
  }, [user?.id]);

  const loadAll = useCallback(async () => {
    await Promise.all([fetchFriends(), fetchRequests(), fetchBlocked()]);
  }, [fetchFriends, fetchRequests, fetchBlocked]);

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, [user?.id, loadAll]);

  const searchUsers = useCallback(async () => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const { data, error } = await supabase.rpc("search_profiles_for_discovery", {
      p_query: q,
      p_limit: 20,
    });
    if (error) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearchResults((data ?? []) as ProfileRow[]);
    setSearching(false);
  }, [searchQuery, user?.id]);

  useEffect(() => {
    if (friendSubTab !== "add") return;
    const t = setTimeout(searchUsers, 300);
    return () => clearTimeout(t);
  }, [searchQuery, searchUsers, friendSubTab]);

  const getRelation = (targetId: string) => {
    const isFriend = friends.some((f) => f.id === targetId);
    const outReq = requests.find(
      (r) => r.direction === "outgoing" && r.receiver_id === targetId
    );
    const inReq = requests.find(
      (r) => r.direction === "incoming" && r.sender_id === targetId
    );
    if (isFriend) return "friend";
    if (outReq) return "outgoing";
    if (inReq) return "incoming";
    return "none";
  };

  const sendFriendRequest = async (receiverId: string) => {
    if (!user?.id) return;
    setActioningId(receiverId);
    const { error } = await supabase.from("friend_requests").insert({
      sender_id: user.id,
      receiver_id: receiverId,
      status: "pending",
    });
    setActioningId(null);
    if (error) {
      if (error.code === "23505")
        Alert.alert("Already sent", "Friend request already sent.");
      else
        Alert.alert(
          "Cannot send request",
          error.message || "Something went wrong."
        );
      return;
    }
    fetchRequests();
  };

  const acceptRequest = async (reqId: string) => {
    if (!user?.id) return;
    setActioningId(reqId);
    const { error } = await supabase.rpc("accept_friend_request", {
      p_request_id: reqId,
    });
    setActioningId(null);
    if (error) {
      Alert.alert(
        "Cannot accept request",
        error.message || "Could not accept request."
      );
      return;
    }
    fetchFriends();
    fetchRequests();
  };

  const declineRequest = async (reqId: string) => {
    setActioningId(reqId);
    await supabase
      .from("friend_requests")
      .update({ status: "declined" })
      .eq("id", reqId);
    setActioningId(null);
    fetchRequests();
  };

  const executeRemoveFriend = async (friendUserId: string) => {
    if (!user?.id) return;
    setActioningId(friendUserId);
    const { error } = await removeFriendship(user.id, friendUserId);
    setActioningId(null);
    if (error) {
      Alert.alert("Could not remove friend", error.message);
      return;
    }
    await loadAll();
  };

  const executeBlock = async (targetId: string) => {
    if (!user?.id) return;
    setActioningId(targetId);
    const { error } = await blockUser(targetId);
    setActioningId(null);
    if (error) {
      Alert.alert("Could not block", error.message);
      return;
    }
    await loadAll();
  };

  const promptBlockUser = (p: ProfileRow) => {
    const name = p.username ?? "this user";
    Alert.alert(
      `Block ${name}?`,
      "They won't be able to interact with you or appear in your discovery search. You can unblock later from the Blocked tab.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => void executeBlock(p.id),
        },
      ],
    );
  };

  const executeUnblock = async (targetId: string) => {
    setActioningId(targetId);
    const { error } = await unblockUser(targetId);
    setActioningId(null);
    if (error) {
      Alert.alert("Could not unblock", error.message);
      return;
    }
    await loadAll();
  };

  const promptRemoveFriend = (friend: ProfileRow) => {
    const name = friend.username ?? "this person";
    Alert.alert(
      "Remove friend?",
      `Remove ${name} from your friends? Within 7 days you can add each other back without a pending request (if age rules allow).`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => void executeRemoveFriend(friend.id),
        },
      ]
    );
  };

  const openDM = async (otherUserId: string) => {
    if (!user?.id) return;
    const { data: convId, error } = await supabase.rpc(
      "get_or_create_dm_conversation",
      { p_other_user_id: otherUserId }
    );
    if (error || !convId) {
      const msg = error?.message ?? "";
      const isAgePolicy =
        /age policy|does not allow this connection/i.test(msg);
      const isFriendsOnlyDm =
        /only accepts (direct )?messages from people on their friends list/i.test(
          msg,
        );
      if (isFriendsOnlyDm) {
        Alert.alert(
          "Messages limited",
          msg ||
            "This person only accepts direct messages from people on their friends list.",
        );
        return;
      }
      if (isAgePolicy) {
        const other = friends.find((f) => f.id === otherUserId)?.friend;
        const label = other?.username ?? "them";
        Alert.alert("Cannot start chat", msg, [
          { text: "OK", style: "cancel" },
          {
            text: "Remove friend",
            style: "destructive",
            onPress: () =>
              Alert.alert(
                "Remove friend?",
                `Remove ${label} from your friends?`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Remove",
                    style: "destructive",
                    onPress: () => void executeRemoveFriend(otherUserId),
                  },
                ]
              ),
          },
        ]);
        return;
      }
      Alert.alert("Cannot start chat", msg || "Could not start chat.");
      return;
    }
    const other = friends.find((f) => f.id === otherUserId)?.friend;
    const title = other?.username ?? "Chat";
    router.push({
      pathname: "/(app)/chat/[conversationId]",
      params: { conversationId: convId, title },
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const renderUserRow = (profile: ProfileRow) => {
    const relation = getRelation(profile.id);
    const isLoading = actioningId === profile.id;
    return (
      <View style={styles.resultRow}>
        <Pressable
          style={styles.resultRowProfile}
          onPress={() => router.push(`/(app)/user/${profile.id}`)}
          android_ripple={{ color: colors.border }}
        >
          <AvatarImage
            userId={profile.id}
            username={profile.username}
            profileImageUrl={profile.profile_image_url}
            size={44}
          />
          <Text style={styles.resultName} numberOfLines={1}>
            {profile.username ?? "Unknown"}
          </Text>
        </Pressable>
        <View style={styles.resultActions}>
          {relation === "friend" && (
            <Pressable
              style={styles.msgButton}
              onPress={() => openDM(profile.id)}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="chatbubble" size={18} color={colors.primary} />
                  <Text style={styles.msgButtonText}>Message</Text>
                </>
              )}
            </Pressable>
          )}
          {relation === "none" && (
            <Pressable
              style={styles.addButton}
              onPress={() => sendFriendRequest(profile.id)}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="person-add" size={18} color="#fff" />
                  <Text style={styles.addButtonText}>Add</Text>
                </>
              )}
            </Pressable>
          )}
          {relation === "outgoing" && (
            <Text style={styles.pendingText}>Request sent</Text>
          )}
          {relation === "incoming" && (
            <View style={styles.incomingActions}>
              <Pressable
                style={styles.acceptButton}
                onPress={() =>
                  acceptRequest(
                    requests.find((r) => r.sender_id === profile.id)!.id
                  )
                }
                disabled={!!actioningId}
              >
                <Text style={styles.acceptButtonText}>Accept</Text>
              </Pressable>
              <Pressable
                style={styles.declineButton}
                onPress={() =>
                  declineRequest(
                    requests.find((r) => r.sender_id === profile.id)!.id
                  )
                }
                disabled={!!actioningId}
              >
                <Text style={styles.declineButtonText}>Decline</Text>
              </Pressable>
            </View>
          )}
          {(relation === "none" || relation === "outgoing") && (
            <Pressable
              style={styles.blockMiniBtn}
              onPress={() => promptBlockUser(profile)}
              disabled={isLoading}
              hitSlop={6}
            >
              <Text style={styles.blockMiniBtnText}>Block</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  const renderFriendRow = ({ item }: { item: FriendRow }) => {
    const busy = actioningId === item.id;
    return (
      <View style={styles.friendRow}>
        <Pressable
          style={styles.friendAvatarBtn}
          onPress={() => router.push(`/(app)/user/${item.friend.id}`)}
          disabled={busy}
          android_ripple={{ color: colors.border }}
          accessibilityLabel="View profile"
          hitSlop={6}
        >
          <AvatarImage
            userId={item.friend.id}
            username={item.friend.username}
            profileImageUrl={item.friend.profile_image_url}
            size={44}
          />
        </Pressable>
        <Pressable
          style={styles.friendRowMain}
          onPress={() => openDM(item.id)}
          disabled={busy}
          android_ripple={{ color: colors.border }}
        >
          <Text style={styles.friendName} numberOfLines={1}>
            {item.friend.username ?? "Unknown"}
          </Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
        <Pressable
          style={styles.friendRemoveBtn}
          onPress={() => promptRemoveFriend(item.friend)}
          disabled={busy}
          hitSlop={8}
          accessibilityLabel="Remove friend"
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <Ionicons name="person-remove-outline" size={22} color={colors.textMuted} />
          )}
        </Pressable>
        <Pressable
          style={styles.friendBlockBtn}
          onPress={() => promptBlockUser(item.friend)}
          disabled={busy}
          hitSlop={8}
          accessibilityLabel="Block user"
        >
          <Ionicons name="ban-outline" size={22} color={colors.textMuted} />
        </Pressable>
      </View>
    );
  };

  const renderBlockedRow = (p: ProfileRow) => {
    const busy = actioningId === p.id;
    return (
      <View style={styles.blockedRow}>
        <AvatarImage
          userId={p.id}
          username={p.username}
          profileImageUrl={p.profile_image_url}
          size={44}
        />
        <Text style={styles.friendName} numberOfLines={1}>
          {p.username ?? "Unknown"}
        </Text>
        <Pressable
          style={styles.unblockBtn}
          onPress={() => executeUnblock(p.id)}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.unblockBtnText}>Unblock</Text>
          )}
        </Pressable>
      </View>
    );
  };

  const renderRequestRow = ({ item }: { item: FriendRequestRow }) => (
    <View style={styles.requestRow}>
      <Pressable
        style={styles.requestRowProfile}
        onPress={() => router.push(`/(app)/user/${item.other_user.id}`)}
        android_ripple={{ color: colors.border }}
      >
        <AvatarImage
          userId={item.other_user.id}
          username={item.other_user.username}
          profileImageUrl={item.other_user.profile_image_url}
          size={44}
        />
        <View style={styles.requestContent}>
          <Text style={styles.requestName} numberOfLines={1}>
            {item.other_user.username ?? "Unknown"}
          </Text>
          <Text style={styles.requestSub}>
            {item.direction === "incoming"
              ? "Sent you a friend request"
              : "Request sent"}
          </Text>
        </View>
      </Pressable>
      {item.direction === "incoming" && (
        <View style={styles.incomingActions}>
          <Pressable
            style={styles.acceptButton}
            onPress={() => acceptRequest(item.id)}
            disabled={actioningId === item.id}
          >
            <Text style={styles.acceptButtonText}>Accept</Text>
          </Pressable>
          <Pressable
            style={styles.declineButton}
            onPress={() => declineRequest(item.id)}
            disabled={actioningId === item.id}
          >
            <Text style={styles.declineButtonText}>Decline</Text>
          </Pressable>
        </View>
      )}
      {item.direction === "outgoing" && (
        <Text style={styles.pendingText}>Pending</Text>
      )}
    </View>
  );

  const refreshProps = {
    refreshing,
    onRefresh,
    tintColor: colors.primary,
  };

  return (
    <View style={[styles.wrap, embedded && styles.wrapEmbedded]}>
      <View style={styles.subTabBar}>
        <Pressable
          style={[
            styles.subTab,
            friendSubTab === "all" && styles.subTabActive,
          ]}
          onPress={() => setFriendSubTab("all")}
        >
          <Text
            style={[
              styles.subTabText,
              friendSubTab === "all" && styles.subTabTextActive,
            ]}
            numberOfLines={1}
          >
            All friends
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.subTab,
            friendSubTab === "requests" && styles.subTabActive,
          ]}
          onPress={() => setFriendSubTab("requests")}
        >
          <View style={styles.subTabInner}>
            <Text
              style={[
                styles.subTabText,
                friendSubTab === "requests" && styles.subTabTextActive,
              ]}
              numberOfLines={1}
            >
              Requests
            </Text>
            {incomingCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {incomingCount > 99 ? "99+" : incomingCount}
                </Text>
              </View>
            )}
          </View>
        </Pressable>
        <Pressable
          style={[
            styles.subTab,
            friendSubTab === "add" && styles.subTabActive,
          ]}
          onPress={() => setFriendSubTab("add")}
        >
          <Text
            style={[
              styles.subTabText,
              friendSubTab === "add" && styles.subTabTextActive,
            ]}
            numberOfLines={1}
          >
            Add friends
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.subTab,
            friendSubTab === "blocked" && styles.subTabActive,
          ]}
          onPress={() => setFriendSubTab("blocked")}
        >
          <Text
            style={[
              styles.subTabText,
              friendSubTab === "blocked" && styles.subTabTextActive,
            ]}
            numberOfLines={1}
          >
            Blocked
          </Text>
        </Pressable>
      </View>

      {friendSubTab === "blocked" ? (
        loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={blockedUsers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => renderBlockedRow(item)}
            contentContainerStyle={
              blockedUsers.length === 0 ? styles.emptyList : styles.list
            }
            refreshControl={<RefreshControl {...refreshProps} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={48}
                  color={colors.textMuted}
                />
                <Text style={styles.emptyTitle}>No blocked users</Text>
                <Text style={styles.emptySub}>
                  Block someone from their friend row or Add friends search
                </Text>
              </View>
            }
          />
        )
      ) : friendSubTab === "add" ? (
        <View style={styles.addKeyboardRoot}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by username"
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.addSection}>
            {searchQuery.trim().length < 2 ? (
              <View style={styles.addHint}>
                <Ionicons name="search" size={40} color={colors.textMuted} />
                <Text style={styles.addHintText}>
                  Type at least 2 characters to search for users
                </Text>
              </View>
            ) : searching ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : searchResults.length === 0 ? (
              <Text style={styles.emptyText}>No users found</Text>
            ) : (
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => renderUserRow(item)}
                style={styles.addFriendsList}
                contentContainerStyle={styles.searchList}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
                refreshControl={<RefreshControl {...refreshProps} />}
              />
            )}
          </View>
        </View>
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : friendSubTab === "all" ? (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          renderItem={renderFriendRow}
          contentContainerStyle={
            friends.length === 0 ? styles.emptyList : styles.list
          }
          refreshControl={<RefreshControl {...refreshProps} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons
                name="people-outline"
                size={48}
                color={colors.textMuted}
              />
              <Text style={styles.emptyTitle}>No friends yet</Text>
              <Text style={styles.emptySub}>
                Open the Add friends tab to search by username
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={renderRequestRow}
          contentContainerStyle={
            requests.length === 0 ? styles.emptyList : styles.list
          }
          refreshControl={<RefreshControl {...refreshProps} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="mail-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No pending requests</Text>
              <Text style={styles.emptySub}>
                When someone sends you a request, it will appear here
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.background,
  },
  wrapEmbedded: {
    minHeight: 0,
  },
  addKeyboardRoot: {
    flex: 1,
    minHeight: 0,
  },
  addFriendsList: {
    flex: 1,
  },
  subTabBar: {
    flexDirection: "row",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.md,
    minWidth: 0,
  },
  subTabActive: {
    backgroundColor: colors.surface,
  },
  subTabInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    maxWidth: "100%",
  },
  subTabText: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.textMuted,
  },
  subTabTextActive: {
    color: colors.primary,
  },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: spacing.xs,
  },
  addSection: {
    flex: 1,
    minHeight: 0,
  },
  addHint: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  addHintText: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: spacing.md,
    textAlign: "center",
  },
  searchList: {
    padding: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultRowProfile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    gap: spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    padding: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  emptyList: {
    flexGrow: 1,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  friendAvatarBtn: {
    justifyContent: "center",
    paddingLeft: spacing.md,
    paddingVertical: spacing.md,
  },
  friendRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingLeft: spacing.sm,
    paddingRight: spacing.sm,
    minWidth: 0,
  },
  friendRowMsgBtn: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  friendRemoveBtn: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  friendBlockBtn: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  blockMiniBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginLeft: spacing.xs,
  },
  blockMiniBtnText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },
  blockedRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unblockBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  unblockBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  requestRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  requestRowProfile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  requestContent: {
    flex: 1,
    minWidth: 0,
    marginLeft: spacing.md,
  },
  requestName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  requestSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  friendName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginLeft: spacing.md,
  },
  resultName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginLeft: spacing.md,
  },
  resultActions: {
    marginLeft: spacing.sm,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  msgButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  msgButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  pendingText: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: "italic",
  },
  incomingActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  acceptButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  acceptButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  declineButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
  },
  declineButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginTop: spacing.md,
  },
  emptySub: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: spacing.lg,
    textAlign: "center",
    paddingHorizontal: spacing.md,
  },
});
