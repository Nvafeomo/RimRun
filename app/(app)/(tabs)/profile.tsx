import { useState, useEffect, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../context/AuthContext';
import { useProfile } from '../../../context/ProfileContext';
import { colors, spacing, borderRadius } from '../../../constants/theme';
import { supabase } from '../../../lib/supabase';
import { AvatarImage } from '../../../components/AvatarImage';

/** Edge Functions return JSON `{ error: string }` on failure; `FunctionsHttpError` hides it unless we read `response`. */
async function messageFromEdgeFunctionFailure(
  error: unknown,
  response?: Response,
): Promise<string> {
  if (response) {
    try {
      const ct = response.headers.get('Content-Type') ?? '';
      if (ct.includes('application/json')) {
        const j = (await response.clone().json()) as { error?: string };
        if (typeof j?.error === 'string' && j.error.trim()) {
          return j.error;
        }
      }
      const text = (await response.clone().text()).trim();
      if (text) return text.slice(0, 400);
    } catch {
      /* ignore parse errors */
    }
    return `Request failed (HTTP ${response.status}).`;
  }
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { profile, loading, updateProfilePicture } = useProfile();
  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [friendsCount, setFriendsCount] = useState<number | null>(null);
  const [courtsJoinedCount, setCourtsJoinedCount] = useState<number | null>(null);
  const [courtsAddedCount, setCourtsAddedCount] = useState<number | null>(null);

  const loadProfileCounts = useCallback(async () => {
    if (!user?.id) return;
    const [friendsRes, joinedRes, addedRes] = await Promise.all([
      supabase
        .from('friendships')
        .select('user_id', { count: 'exact', head: true })
        .eq('user_id', user.id),
      supabase
        .from('court_subscriptions')
        .select('court_id', { count: 'exact', head: true })
        .eq('user_id', user.id),
      supabase
        .from('courts')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', user.id),
    ]);
    setFriendsCount(friendsRes.error ? 0 : (friendsRes.count ?? 0));
    setCourtsJoinedCount(joinedRes.error ? 0 : (joinedRes.count ?? 0));
    // Until user-courts-migration.sql (created_by column + RLS), this may error — show 0.
    setCourtsAddedCount(addedRes.error ? 0 : (addedRes.count ?? 0));
  }, [user?.id]);

  useEffect(() => {
    loadProfileCounts();
  }, [loadProfileCounts]);

  useFocusEffect(
    useCallback(() => {
      loadProfileCounts();
    }, [loadProfileCounts])
  );

  function handleDeleteAccountPress() {
    Alert.alert(
      'Delete Account',
      'Are you sure? This will permanently delete your account and all your data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: handleDeleteAccount,
        },
      ]
    );
  }

  async function handleDeleteAccount() {
    if (!user?.id) return;
    setDeletingAccount(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error('Your session expired. Sign in again and try deleting your account.');
      }
      const { data, error, response } = await supabase.functions.invoke(
        'delete-account',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (error) {
        const detail = await messageFromEdgeFunctionFailure(error, response);
        console.error('Delete account error', { detail, status: response?.status });
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      await signOut();
      router.replace('/(auth)/login');
    } catch (e) {
      console.error('Delete account error', e);
      Alert.alert(
        'Could not delete account',
        e instanceof Error ? e.message : 'An error occurred. Make sure the delete-account Edge Function is deployed.'
      );
    } finally {
      setDeletingAccount(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } catch (e) {
      console.error('Sign out error', e);
    } finally {
      setSigningOut(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const displayName = profile?.username ?? user?.email?.split('@')[0] ?? 'User';
  const displayEmail = profile?.email ?? user?.email ?? '';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroAccent} />

        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>Your account and preferences</Text>

        <View style={styles.profileCard}>
          <TouchableOpacity
            style={styles.avatarOuter}
            onPress={updateProfilePicture}
            activeOpacity={0.85}
          >
            <View style={styles.avatarRing}>
              {user?.id ? (
                <AvatarImage
                  userId={user.id}
                  username={profile?.username}
                  profileImageUrl={profile?.profile_image_url}
                  size={108}
                />
              ) : null}
            </View>
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={14} color={colors.text} />
              <Text style={styles.editBadgeText}>Photo</Text>
            </View>
          </TouchableOpacity>

          <Text style={styles.name}>{displayName}</Text>
          {displayEmail ? (
            <Text style={styles.email} numberOfLines={1}>
              {displayEmail}
            </Text>
          ) : null}

          <View style={styles.statsPanel}>
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => router.push('/(app)/friends')}
              activeOpacity={0.7}
            >
              <Text style={styles.statValue}>
                {friendsCount !== null ? friendsCount : '—'}
              </Text>
              <Text style={styles.statLabel}>Friends</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={styles.statItem}
              onPress={() =>
                router.push({
                  pathname: '/(app)/(tabs)/chats',
                  params: { tab: 'courts' },
                })
              }
              activeOpacity={0.7}
            >
              <Text style={styles.statValue}>
                {courtsJoinedCount !== null ? courtsJoinedCount : '—'}
              </Text>
              <Text style={styles.statLabel} numberOfLines={2}>
                Joined
              </Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {courtsAddedCount !== null ? courtsAddedCount : '—'}
              </Text>
              <Text style={styles.statLabel} numberOfLines={2}>
                Added
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionHeading}>Settings</Text>
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/(app)/account')}
          >
            <View style={styles.actionLeft}>
              <View style={styles.actionIconWrap}>
                <Ionicons name="person-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.actionButtonText}>Account</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/(app)/privacy-settings')}
          >
            <View style={styles.actionLeft}>
              <View style={styles.actionIconWrap}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.actionButtonText}>Privacy</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonLast]}
            onPress={() => router.push('/(app)/privacy-policy')}
            accessibilityRole="button"
            accessibilityLabel="Privacy policy"
          >
            <View style={styles.actionLeft}>
              <View style={styles.actionIconWrap}>
                <Ionicons name="document-text-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.actionButtonText}>Privacy policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={handleSignOut}
          disabled={signingOut}
          style={styles.signOutButton}
        >
          {signingOut ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={20} color={colors.primary} />
              <Text style={styles.signOutText}>Sign out</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleDeleteAccountPress}
          disabled={deletingAccount}
          style={styles.deleteAccountButton}
        >
          {deletingAccount ? (
            <ActivityIndicator color={colors.text} size="small" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={18} color={colors.text} />
              <Text style={styles.deleteAccountText}>Delete account</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const cardShadow =
  Platform.OS === 'ios'
    ? {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      }
    : { elevation: 6 };

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  heroAccent: {
    height: 3,
    backgroundColor: colors.primary,
    borderRadius: 2,
    marginHorizontal: -spacing.lg,
    marginBottom: spacing.md,
    opacity: 0.9,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  avatarOuter: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  avatarRing: {
    borderWidth: 3,
    borderColor: colors.primary,
    borderRadius: borderRadius.full,
    padding: 3,
    backgroundColor: colors.background,
  },
  editBadge: {
    position: 'absolute',
    bottom: -2,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  editBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  name: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: spacing.xs,
    letterSpacing: -0.2,
  },
  email: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: spacing.md,
    maxWidth: '100%',
  },
  statsPanel: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 2,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
  sectionHeading: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginLeft: 2,
  },
  actionsSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  actionButtonLast: {
    borderBottomWidth: 0,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  signOutText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.error,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  deleteAccountText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
});
