import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Linking,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, borderRadius } from '../../constants/theme';
import { SUPPORT_EMAIL } from '../../lib/support';

export default function BannedScreen() {
  const {
    banAppealPending,
    submitBanAppeal,
    signOut,
    clearBanBlocked,
    user,
  } = useAuth();
  const [appealMessage, setAppealMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  function handleContactSupport() {
    void Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=RimRun%20account%20suspension`,
    );
  }

  async function handleSubmitAppeal() {
    setSubmitting(true);
    const result = await submitBanAppeal(appealMessage);
    setSubmitting(false);
    if (result.ok) {
      setAppealMessage('');
      Alert.alert(
        'Appeal submitted',
        'We will review your appeal and get back to you by email.',
      );
      return;
    }
    if (result.reason === 'appeal_pending') {
      Alert.alert('Appeal pending', 'You already have an appeal under review.');
      return;
    }
    Alert.alert('Could not submit', result.error ?? 'Try again later.');
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      clearBanBlocked();
      router.replace('/(auth)/login');
    } finally {
      setSigningOut(false);
    }
  }

  const canSubmitAppeal =
    user && !banAppealPending && appealMessage.trim().length >= 10;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Image
            source={require('../../assets/rimrun-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.iconWrap}>
            <Ionicons name="ban" size={40} color={colors.error} />
          </View>
          <Text style={styles.title}>Account suspended</Text>
          <Text style={styles.body}>
            Your RimRun account has been suspended for violating our community
            guidelines. You cannot use the app while this suspension is active.
          </Text>

          {banAppealPending ? (
            <View style={styles.pendingBox}>
              <Ionicons name="time-outline" size={22} color={colors.primary} />
              <Text style={styles.pendingTitle}>Appeal under review</Text>
              <Text style={styles.pendingBody}>
                We received your appeal and will respond by email. You can still
                contact support below.
              </Text>
            </View>
          ) : user ? (
            <View style={styles.appealBox}>
              <Text style={styles.appealLabel}>Submit an appeal</Text>
              <Text style={styles.appealHint}>
                Explain why you believe this suspension was a mistake (min. 10
                characters).
              </Text>
              <TextInput
                style={styles.appealInput}
                value={appealMessage}
                onChangeText={setAppealMessage}
                placeholder="Your message to the moderation team…"
                placeholderTextColor={colors.textMuted}
                multiline
                editable={!submitting}
                textAlignVertical="top"
              />
              <Pressable
                style={[
                  styles.primaryButton,
                  !canSubmitAppeal && styles.primaryButtonDisabled,
                ]}
                onPress={() => void handleSubmitAppeal()}
                disabled={!canSubmitAppeal || submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <>
                    <Ionicons
                      name="paper-plane-outline"
                      size={20}
                      color={colors.text}
                    />
                    <Text style={styles.primaryButtonText}>Submit appeal</Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : (
            <Text style={styles.bodySecondary}>
              Sign in with your suspended account to submit an appeal, or email
              support.
            </Text>
          )}

          <Pressable
            style={styles.outlineButton}
            onPress={handleContactSupport}
            accessibilityRole="button"
          >
            <Ionicons name="mail-outline" size={20} color={colors.primary} />
            <Text style={styles.outlineButtonText}>Contact support</Text>
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={() => void handleSignOut()}
            disabled={signingOut}
            accessibilityRole="button"
          >
            {signingOut ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Text style={styles.secondaryButtonText}>Sign out</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl * 2,
    alignItems: 'center',
  },
  logo: {
    width: 72,
    height: 72,
    marginBottom: spacing.lg,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  bodySecondary: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  appealBox: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  appealLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  appealHint: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  appealInput: {
    minHeight: 120,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.inputBg,
    marginBottom: spacing.md,
  },
  pendingBox: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  pendingTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  pendingBody: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    width: '100%',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    width: '100%',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: spacing.sm,
  },
  outlineButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  secondaryButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
