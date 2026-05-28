import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Platform,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import { useCourtAliases } from "../../../hooks/useCourtAliases";
import { colors, spacing, borderRadius, shadows, typography } from "../../../constants/theme";
import {
  CourtDetailTags,
  buildCoreCourtDetailTags,
} from "../../../components/CourtDetailTags";
import { CourtVotingPanel } from "../../../components/CourtVotingPanel";
import {
  fetchCourtVoteState,
  castCourtVote,
  buildCourtVoteState,
  type CourtVoteState,
  type VoteType,
} from "../../../lib/courtVoting";

type Court = {
  id: string;
  name: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  hoops: number | null;
  is_private: boolean | null;
  is_indoor: boolean | null;
  source: string | null;
  created_by: string | null;
  verified: boolean;
  flagged_for_review: boolean;
  verify_count: number;
  flag_count: number;
};

export default function CourtDetailScreen() {
  const insets = useSafeAreaInsets();
  const { courtId } = useLocalSearchParams<{ courtId: string }>();
  const { user } = useAuth();
  const { getDisplayName } = useCourtAliases();
  const [court, setCourt] = useState<Court | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [joiningChat, setJoiningChat] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [voteState, setVoteState] = useState<CourtVoteState | null>(null);
  const [voting, setVoting] = useState(false);

  const loadVoteState = useCallback(async () => {
    if (!courtId) return;
    const state = await fetchCourtVoteState(courtId, user?.id);
    setVoteState(state);
    if (state) {
      setCourt((prev) =>
        prev
          ? {
              ...prev,
              verified: state.verified,
              flagged_for_review: state.flaggedForReview,
              verify_count: state.verifyCount,
              flag_count: state.flagCount,
            }
          : prev,
      );
    }
  }, [courtId, user?.id]);

  const fetchSubscription = useCallback(async () => {
    if (!courtId || !user?.id) return false;
    const { data } = await supabase
      .from("court_subscriptions")
      .select("court_id")
      .eq("user_id", user.id)
      .eq("court_id", courtId)
      .maybeSingle();
    return !!data;
  }, [courtId, user?.id]);

  useEffect(() => {
    if (!courtId) return;
    const load = async () => {
      setLoading(true);
      const [courtRes, subRes, myVoteRes, subCountRes] = await Promise.all([
        supabase
          .from("courts")
          .select(
            "id, name, address, latitude, longitude, hoops, is_private, is_indoor, source, created_by, verified, flagged_for_review, verify_count, flag_count",
          )
          .eq("id", courtId)
          .single(),
        fetchSubscription(),
        user?.id
          ? supabase
              .from("court_votes")
              .select("vote_type")
              .eq("court_id", courtId)
              .eq("user_id", user.id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("court_subscriptions")
          .select("court_id", { count: "exact", head: true })
          .eq("court_id", courtId),
      ]);

      if (courtRes.error) {
        console.error("Error fetching court:", courtRes.error);
        setCourt(null);
        setVoteState(null);
      } else {
        setCourt(courtRes.data);
        const subscribers = subCountRes.count ?? 0;
        setVoteState(
          buildCourtVoteState({
            verified: courtRes.data.verified,
            flagged_for_review: courtRes.data.flagged_for_review,
            verify_count: courtRes.data.verify_count,
            flag_count: courtRes.data.flag_count,
            subscriberCount: subscribers,
            myVote: (myVoteRes.data?.vote_type as VoteType) ?? null,
          }),
        );
      }
      setSubscribed(subRes);
      setLoading(false);
    };
    load();
  }, [courtId, fetchSubscription, user?.id]);

  const submitVote = async (newVote: VoteType) => {
    if (!courtId) return;
    setVoting(true);
    const result = await castCourtVote(courtId, newVote);
    if (!result.ok) {
      Alert.alert("Could not vote", result.reason ?? "Try again.");
    } else {
      await loadVoteState();
    }
    setVoting(false);
  };

  const handleVote = async (type: "verify" | "flag") => {
    if (!subscribed) {
      Alert.alert(
        "Subscribe first",
        "You need to be subscribed to this court to vote on it.",
      );
      return;
    }
    if (voting) return;

    const newVote = voteState?.myVote === type ? null : type;

    if (type === "flag" && newVote === "flag") {
      Alert.alert(
        "Flag this court?",
        "This means you believe the court no longer exists or has incorrect information. If enough subscribers agree, it will be reviewed for removal.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Flag it",
            style: "destructive",
            onPress: () => void submitVote(newVote),
          },
        ],
      );
      return;
    }

    await submitVote(newVote);
  };

  const handleSubscribe = async () => {
    if (!courtId || !user?.id || subscribing) return;
    setSubscribing(true);
    try {
      if (subscribed) {
        await supabase
          .from("court_subscriptions")
          .delete()
          .eq("user_id", user.id)
          .eq("court_id", courtId);
        setSubscribed(false);
      } else {
        await supabase.from("court_subscriptions").insert({
          user_id: user.id,
          court_id: courtId,
        });
        setSubscribed(true);
      }
      await loadVoteState();
    } catch (err) {
      console.error("Error toggling subscription:", err);
    } finally {
      setSubscribing(false);
    }
  };

  const handleJoinChat = async () => {
    if (!courtId || joiningChat) return;
    if (!user?.id) return;
    setJoiningChat(true);
    try {
      if (!subscribed) {
        await supabase.from("court_subscriptions").insert({
          user_id: user.id,
          court_id: courtId,
        });
        setSubscribed(true);
      }
      const { data: conversationId, error } = await supabase.rpc(
        "get_or_create_court_conversation",
        { p_court_id: courtId }
      );
      if (error) throw error;
      if (conversationId) {
        router.push({
          pathname: "/(app)/chat/[conversationId]",
          params: {
            conversationId,
            title: court ? getDisplayName(court.id, court.name ?? "Court Chat") : "Court Chat",
            courtId: court?.id ?? courtId,
            courtName: court?.name ?? "Court",
          },
        });
      }
    } catch (err) {
      console.error("Error joining court chat:", err);
    } finally {
      setJoiningChat(false);
    }
  };

  const isCreator =
    !!user?.id && !!court?.created_by && court.created_by === user.id;

  const handleDeleteCourt = () => {
    if (!courtId || !user?.id || deleting) return;
    Alert.alert(
      "Remove court",
      "This permanently deletes this court for everyone (map, chat, subscriptions). This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              const { error } = await supabase.from("courts").delete().eq("id", courtId);
              if (error) {
                console.error("Delete court error:", error);
                Alert.alert(
                  "Could not remove court",
                  error.code === "42501" || error.message.includes("row-level security")
                    ? "Permission denied. Run the latest user-courts-migration.sql (delete policy) in Supabase."
                    : error.message
                );
                return;
              }
              router.replace("/(app)/(tabs)/courts");
            } catch (e) {
              console.error(e);
              Alert.alert("Error", e instanceof Error ? e.message : "Something went wrong.");
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleOpenInMaps = () => {
    const { latitude, longitude } = court!;
    const label = encodeURIComponent(court!.name ?? "Basketball Court");
    const url =
      Platform.OS === "ios"
        ? `https://maps.apple.com/?ll=${latitude},${longitude}&q=${label}`
        : `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    // openURL returns a Promise; it can reject even after Maps opens — must catch or Metro reports uncaught promise.
    void Linking.openURL(url).catch((err) => {
      console.warn("Open in Maps:", err);
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!court) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Court not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.body}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {court.name ?? "Basketball Court"}
          </Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.contentInner,
            { paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.md) },
          ]}
          keyboardShouldPersistTaps="handled"
        >
        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Details</Text>
          {court.hoops != null && (
            <View style={styles.detailRow}>
              <View style={styles.detailIconWrap}>
                <Ionicons name="basketball" size={18} color={colors.primary} />
              </View>
              <Text style={styles.detailText}>
                {court.hoops} hoop{court.hoops !== 1 ? "s" : ""}
              </Text>
            </View>
          )}
          {court.address && (
            <View style={styles.detailRow}>
              <View style={styles.detailIconWrap}>
                <Ionicons name="location" size={18} color={colors.primary} />
              </View>
              <Text style={styles.detailText}>{court.address}</Text>
            </View>
          )}
          <Pressable
            onPress={handleOpenInMaps}
            style={({ pressed }) => [
              styles.openInMapsButton,
              pressed && styles.openInMapsButtonPressed,
            ]}
          >
            <Ionicons name="map" size={18} color={colors.primary} />
            <Text style={styles.openInMapsText}>Open in Maps</Text>
            <Ionicons
              name="open-outline"
              size={16}
              color={colors.primary}
              style={styles.openInMapsChevron}
            />
          </Pressable>
        </View>

        <CourtDetailTags tags={buildCoreCourtDetailTags(court)} />

        {voteState && subscribed ? (
          <CourtVotingPanel
            voteState={voteState}
            voting={voting}
            onVerifyPress={() => void handleVote("verify")}
            onFlagPress={() => void handleVote("flag")}
          />
        ) : subscribed === false ? (
          <Text style={styles.votingHint}>
            Subscribe to vote on community verification for this court.
          </Text>
        ) : null}

        <Text style={styles.actionsLabel}>Actions</Text>
        <Pressable
          onPress={handleSubscribe}
          style={[styles.button, subscribed && styles.buttonSubscribed]}
          disabled={subscribing}
        >
          <Ionicons
            name={subscribed ? "heart" : "heart-outline"}
            size={22}
            color={subscribed ? colors.text : colors.primary}
          />
          <Text
            style={[
              styles.buttonText,
              subscribed && styles.buttonTextSubscribed,
            ]}
          >
            {subscribing
              ? "Updating..."
              : subscribed
                ? "Subscribed"
                : "Subscribe to Court"}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleJoinChat}
          style={styles.buttonPrimary}
          disabled={joiningChat}
        >
          {joiningChat ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <Ionicons name="chatbubbles" size={22} color={colors.text} />
          )}
          <Text style={styles.buttonPrimaryText}>
            {joiningChat ? "Joining..." : "Enter Chat"}
          </Text>
        </Pressable>

        {isCreator ? (
          <Pressable
            onPress={handleDeleteCourt}
            style={styles.deleteButton}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Ionicons name="trash-outline" size={22} color={colors.text} />
            )}
            <Text style={styles.deleteButtonText}>
              {deleting ? "Removing..." : "Remove court"}
            </Text>
          </Pressable>
        ) : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  /** Fills stack; minHeight:0 lets ScrollView take remaining space on Android flex. */
  body: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
  },
  contentInner: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  section: {
    marginBottom: spacing.xl,
  },
  detailsCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.soft,
  },
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  actionsLabel: {
    ...typography.sectionTitle,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  votingHint: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.lg,
    lineHeight: 18,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  detailIconWrap: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  detailText: {
    flex: 1,
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    paddingTop: 4,
  },
  openInMapsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  openInMapsButtonPressed: {
    opacity: 0.88,
  },
  openInMapsText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.primary,
  },
  openInMapsChevron: {
    opacity: 0.85,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.primary,
    marginBottom: spacing.md,
  },
  buttonSubscribed: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary,
  },
  buttonTextSubscribed: {
    color: colors.text,
  },
  buttonPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary,
    marginBottom: spacing.md,
    ...shadows.soft,
  },
  buttonPrimaryText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.error,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
});
