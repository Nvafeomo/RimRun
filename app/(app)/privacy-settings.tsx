import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Switch,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useProfile } from "../../context/ProfileContext";
import { colors, spacing, borderRadius } from "../../constants/theme";
import { supabase } from "../../lib/supabase";
import { ageInFullYears } from "../../lib/agePolicy";

export default function PrivacySettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile, loading: profileLoading, refreshProfile } = useProfile();

  const [showFriends, setShowFriends] = useState(true);
  const [showCourtsJoined, setShowCourtsJoined] = useState(true);
  const [showCourtsAdded, setShowCourtsAdded] = useState(true);
  const [messagesFriendsOnly, setMessagesFriendsOnly] = useState(false);
  const [usernameSearchable, setUsernameSearchable] = useState(true);
  const [saving, setSaving] = useState(false);

  const age =
    profile?.date_of_birth != null
      ? ageInFullYears(profile.date_of_birth)
      : null;
  const isMinor = age !== null && age < 18;

  useEffect(() => {
    if (!profile) return;
    setShowFriends(profile.profile_public_show_friends ?? true);
    setShowCourtsJoined(profile.profile_public_show_courts_joined ?? true);
    setShowCourtsAdded(profile.profile_public_show_courts_added ?? true);
    setMessagesFriendsOnly(profile.messages_only_from_friends ?? false);
    setUsernameSearchable(profile.username_searchable ?? true);
  }, [profile]);

  const persist = useCallback(
    async (patch: {
      profile_public_show_friends?: boolean;
      profile_public_show_courts_joined?: boolean;
      profile_public_show_courts_added?: boolean;
      messages_only_from_friends?: boolean;
      username_searchable?: boolean;
    }) => {
      if (!user?.id) return;
      setSaving(true);
      const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
      setSaving(false);
      if (error) {
        console.error("Privacy update error", error);
        Alert.alert(
          "Could not save",
          error.message ?? "Something went wrong. If you just added this feature, run the profile-privacy SQL migration on Supabase.",
        );
        return;
      }
      await refreshProfile();
    },
    [user?.id, refreshProfile],
  );

  if (!user || profileLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Privacy</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          Control what others see on your public profile, who can reach you in
          DMs, and whether you appear in friend discovery search.
        </Text>

        <Text style={styles.sectionLabel}>Public profile</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Show friends count</Text>
              <Text style={styles.rowHint}>
                When off, others won&apos;t see how many friends you have.
              </Text>
            </View>
            <Switch
              value={showFriends}
              onValueChange={(v) => {
                setShowFriends(v);
                void persist({ profile_public_show_friends: v });
              }}
              disabled={saving}
              trackColor={{ false: colors.border, true: colors.primaryDark }}
              thumbColor={showFriends ? colors.primary : colors.textMuted}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Show courts joined</Text>
              <Text style={styles.rowHint}>
                When off, others won&apos;t see how many courts you follow.
              </Text>
            </View>
            <Switch
              value={showCourtsJoined}
              onValueChange={(v) => {
                setShowCourtsJoined(v);
                void persist({ profile_public_show_courts_joined: v });
              }}
              disabled={saving}
              trackColor={{ false: colors.border, true: colors.primaryDark }}
              thumbColor={showCourtsJoined ? colors.primary : colors.textMuted}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Show courts added</Text>
              <Text style={styles.rowHint}>
                When off, others won&apos;t see how many courts you submitted.
              </Text>
            </View>
            <Switch
              value={showCourtsAdded}
              onValueChange={(v) => {
                setShowCourtsAdded(v);
                void persist({ profile_public_show_courts_added: v });
              }}
              disabled={saving}
              trackColor={{ false: colors.border, true: colors.primaryDark }}
              thumbColor={showCourtsAdded ? colors.primary : colors.textMuted}
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>Messaging &amp; discovery</Text>
        <Text style={styles.sectionBlurb}>
          Two separate controls: one is who can open a{" "}
          <Text style={styles.sectionBlurbEm}>new private chat</Text> with you. The
          other is whether you appear when someone searches by username to send a{" "}
          <Text style={styles.sectionBlurbEm}>friend request</Text>. Someone could
          still request you if they meet you elsewhere (e.g. a court chat); search
          only affects the Add friends lookup.
        </Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>New DMs from friends only</Text>
              <Text style={styles.rowHint}>
                Strangers can&apos;t start a new DM with you. Existing chats are
                unchanged.
              </Text>
            </View>
            <Switch
              value={messagesFriendsOnly}
              onValueChange={(v) => {
                setMessagesFriendsOnly(v);
                void persist({ messages_only_from_friends: v });
              }}
              disabled={saving}
              trackColor={{ false: colors.border, true: colors.primaryDark }}
              thumbColor={messagesFriendsOnly ? colors.primary : colors.textMuted}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Show up in Add friends search</Text>
              <Text style={styles.rowHint}>
                Lets people find you by username under Chats → Friends → Add.
                {isMinor
                  ? " Off by default under 18; turn on if you want to be discoverable."
                  : " Turn off to rely on meeting people in-app instead of lookup."}
              </Text>
            </View>
            <Switch
              value={usernameSearchable}
              onValueChange={(v) => {
                setUsernameSearchable(v);
                void persist({ username_searchable: v });
              }}
              disabled={saving}
              trackColor={{ false: colors.border, true: colors.primaryDark }}
              thumbColor={usernameSearchable ? colors.primary : colors.textMuted}
            />
          </View>
        </View>
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
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  intro: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  sectionBlurb: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  sectionBlurbEm: {
    fontWeight: "600",
    color: colors.text,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  rowHint: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.md,
  },
});
