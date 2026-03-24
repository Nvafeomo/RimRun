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
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import { useCourtAliases } from "../../../hooks/useCourtAliases";
import { colors, spacing, borderRadius } from "../../../constants/theme";

type Court = {
  id: string;
  name: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  hoops: number | null;
  is_private: boolean | null;
};

export default function CourtDetailScreen() {
  const { courtId } = useLocalSearchParams<{ courtId: string }>();
  const { user } = useAuth();
  const { getDisplayName } = useCourtAliases();
  const [court, setCourt] = useState<Court | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [joiningChat, setJoiningChat] = useState(false);

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
      const [courtRes, subRes] = await Promise.all([
        supabase
          .from("courts")
          .select("id, name, address, latitude, longitude, hoops, is_private")
          .eq("id", courtId)
          .single(),
        fetchSubscription(),
      ]);
      if (courtRes.error) {
        console.error("Error fetching court:", courtRes.error);
        setCourt(null);
      } else {
        setCourt(courtRes.data);
      }
      setSubscribed(subRes);
      setLoading(false);
    };
    load();
  }, [courtId, fetchSubscription]);

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

  const handleOpenInMaps = () => {
    const { latitude, longitude } = court!;
    const label = encodeURIComponent(court!.name ?? "Basketball Court");
    const url =
      Platform.OS === "ios"
        ? `https://maps.apple.com/?ll=${latitude},${longitude}&q=${label}`
        : `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    Linking.openURL(url);
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
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {court.name ?? "Basketball Court"}
        </Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>
          {court.hoops != null && (
            <View style={styles.detailRow}>
              <Ionicons name="basketball" size={20} color={colors.primary} />
              <Text style={styles.detailText}>
                {court.hoops} hoop{court.hoops !== 1 ? "s" : ""}
              </Text>
            </View>
          )}
          {court.address && (
            <View style={styles.detailRow}>
              <Ionicons name="location" size={20} color={colors.primary} />
              <Text style={styles.detailText}>{court.address}</Text>
            </View>
          )}
          {court.is_private && (
            <View style={styles.detailRow}>
              <Ionicons name="lock-closed" size={20} color={colors.primary} />
              <Text style={styles.detailText}>Private court</Text>
            </View>
          )}
          <Pressable
            onPress={handleOpenInMaps}
            style={styles.openInMapsButton}
          >
            <Ionicons name="map" size={20} color={colors.primary} />
            <Text style={styles.openInMapsText}>Open in Maps</Text>
          </Pressable>
        </View>

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
      </ScrollView>
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
  content: {
    flex: 1,
  },
  contentInner: {
    padding: spacing.lg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  detailText: {
    flex: 1,
    fontSize: 15,
    color: colors.textSecondary,
  },
  openInMapsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
    marginTop: spacing.sm,
  },
  openInMapsText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.primary,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
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
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    marginBottom: spacing.md,
  },
  buttonPrimaryText: {
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
