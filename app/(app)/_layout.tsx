// app/(app)/_layout.tsx
import { Stack, Redirect } from 'expo-router';
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { colors, spacing, borderRadius } from '../../constants/theme';

const stackScreenOptions = {
  headerShown: false as const,
  /** Android: stack card must fill height or flex children (e.g. ScrollView) collapse. */
  contentStyle: { flex: 1, backgroundColor: colors.background },
};

export default function AppLayout() {
  const { user, loading: authLoading, banBlocked, signOut } = useAuth();
  const { profile, loading: profileLoading, profileFetchFailed, refreshProfile } = useProfile();

  if (authLoading || (user && profileLoading && !profile && !profileFetchFailed)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (banBlocked) {
    return <Redirect href="/(banned)" />;
  }
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }
  if (!profile?.date_of_birth) {
    if (profileFetchFailed) {
      return (
        <View style={styles.offlineGate}>
          <Text style={styles.offlineTitle}>Couldn&apos;t load your profile</Text>
          <Text style={styles.offlineBody}>
            Check your connection and try again. RimRun needs network access on first launch.
          </Text>
          <TouchableOpacity style={styles.offlineButton} onPress={() => void refreshProfile()}>
            <Text style={styles.offlineButtonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.offlineLink} onPress={() => void signOut()}>
            <Text style={styles.offlineLinkText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return <Redirect href="/(auth)/onboarding" />;
  }
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="court/[courtId]" />
      <Stack.Screen name="chat/[conversationId]" />
      <Stack.Screen name="friends/index" />
      <Stack.Screen name="court/add" />
      <Stack.Screen name="account" />
      <Stack.Screen name="privacy-settings" />
      <Stack.Screen name="privacy-policy" />
      <Stack.Screen name="terms-of-service" />
      <Stack.Screen name="user/[userId]" />
      <Stack.Screen name="admin/moderation" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  offlineGate: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
  },
  offlineTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  offlineBody: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  offlineButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  offlineButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  offlineLink: {
    paddingVertical: spacing.sm,
  },
  offlineLinkText: {
    color: colors.primaryLight,
    fontSize: 15,
    fontWeight: '600',
  },
});
