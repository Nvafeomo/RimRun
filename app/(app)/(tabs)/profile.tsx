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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useAuth } from '../../../context/AuthContext';
import { useProfile } from '../../../context/ProfileContext';
import { colors, spacing, borderRadius } from '../../../constants/theme';
import { supabase } from '../../../lib/supabase';

const formatDateForDisplay = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { profile, loading, updateProfilePicture } = useProfile();
  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [friendsCount, setFriendsCount] = useState<number | null>(null);
  const [courtsCount, setCourtsCount] = useState<number | null>(null);

  // Fetch friends and courts counts
  useEffect(() => {
    if (!user?.id) return;
    const loadCounts = async () => {
      const courtsRes = await supabase
        .from('court_subscriptions')
        .select('court_id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      setCourtsCount(courtsRes.error ? 0 : (courtsRes.count ?? 0));

      const friendsRes = await supabase
        .from('friendships')
        .select('user_id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      setFriendsCount(friendsRes.error ? 0 : (friendsRes.count ?? 0));
    };
    loadCounts();
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        supabase
          .from('friendships')
          .select('user_id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .then((r) => setFriendsCount(r.error ? 0 : (r.count ?? 0)));
      }
    }, [user?.id])
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
    setDeletingAccount(true);
    try {
      await supabase.auth.admin.deleteUser(user?.id ?? '');
      await supabase.from('profiles').delete().eq('id', user?.id ?? '');
    } catch (e) {
      console.error('Delete account error', e);
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
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>Your profile and settings</Text>

        {/* Profile card */}
        <View style={styles.profileCard}>
          <TouchableOpacity
            style={styles.avatarWrapper}
            onPress={updateProfilePicture}
            activeOpacity={0.8}
          >
            {profile?.profile_image_url ? (
              <Image
                key={profile.profile_image_url}
                source={{ uri: profile.profile_image_url }}
                style={styles.avatar}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarPlaceholderText}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.editBadge}>
              <Text style={styles.editBadgeText}>Edit</Text>
            </View>
          </TouchableOpacity>

          <Text style={styles.name}>{displayName}</Text>
          {displayEmail ? (
            <Text style={styles.email}>{displayEmail}</Text>
          ) : null}
          {profile?.date_of_birth ? (
            <Text style={styles.dateOfBirth}>
              Born {formatDateForDisplay(profile.date_of_birth)}
            </Text>
          ) : null}
        </View>

        {/* Settings */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/(app)/friends')}
          >
            <Text style={styles.actionButtonText}>
              Friends: {friendsCount !== null ? friendsCount : '...'}
            </Text>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => {}}>
            <Text style={styles.actionButtonText}>
              Courts: {courtsCount !== null ? courtsCount : '...'}
            </Text>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => {}}>
            <Text style={styles.actionButtonText}>Account</Text>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => {}}>
            <Text style={styles.actionButtonText}>Notifications</Text>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => {}}>
            <Text style={styles.actionButtonText}>Privacy</Text>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.spacer} />

        <TouchableOpacity
          onPress={handleSignOut}
          disabled={signingOut}
          style={styles.signOutButton}
        >
          {signingOut ? (
            <ActivityIndicator color={colors.text} size="small" />
          ) : (
            <Text style={styles.signOutText}>Sign Out</Text>
          )}
        </TouchableOpacity>

        <View style={styles.spacer} />

        <TouchableOpacity
          onPress={handleDeleteAccountPress}
          disabled={deletingAccount}
          style={styles.deleteAccountButton}
        >
          {deletingAccount ? (
            <ActivityIndicator color={colors.text} size="small" />
          ) : (
            <Text style={styles.deleteAccountText}>Delete Account</Text>
          )}
        </TouchableOpacity>
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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
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
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  editBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  editBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  name: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  email: {
    color: colors.textSecondary,
    fontSize: 15,
    marginBottom: spacing.xs,
  },
  dateOfBirth: {
    color: colors.textMuted,
    fontSize: 14,
  },
  actionsSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  actionChevron: {
    color: colors.textMuted,
    fontSize: 20,
    fontWeight: '300',
  },
  spacer: {
    flex: 1,
    minHeight: spacing.lg,
  },
  signOutButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  signOutText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  deleteAccountButton: {
    backgroundColor: colors.error,
    borderWidth: 1.5,
    borderColor: colors.text,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  deleteAccountText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
