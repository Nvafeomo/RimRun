import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, shadows, typography } from '../constants/theme';
import type { CourtVoteState } from '../lib/courtVoting';

type Props = {
  voteState: CourtVoteState;
  voting: boolean;
  onVerifyPress: () => void;
  onFlagPress: () => void;
};

export function CourtVotingPanel({
  voteState,
  voting,
  onVerifyPress,
  onFlagPress,
}: Props) {
  const verifyRemaining = Math.max(
    0,
    voteState.verifyThreshold - voteState.verifyCount,
  );
  const flagRemaining = Math.max(0, voteState.flagThreshold - voteState.flagCount);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Community verification</Text>
      <Text style={styles.subtitle}>
        {voteState.subscriberCount} subscriber
        {voteState.subscriberCount !== 1 ? 's' : ''} · tap your vote again to retract
      </Text>

      {voteState.verified ? (
        <View style={styles.statusBadgeVerified}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={styles.statusBadgeVerifiedText}>Verified by community</Text>
        </View>
      ) : null}

      {voteState.flaggedForReview ? (
        <View style={styles.statusBadgeFlagged}>
          <Ionicons name="warning" size={18} color={colors.error} />
          <Text style={styles.statusBadgeFlaggedText}>Flagged for review</Text>
        </View>
      ) : null}

      {!voteState.verified && !voteState.flaggedForReview ? (
        <Text style={styles.hint}>
          {verifyRemaining > 0
            ? `${verifyRemaining} more verification${verifyRemaining !== 1 ? 's' : ''} needed for verified status`
            : 'Threshold met — awaiting evaluation'}
        </Text>
      ) : null}

      {voteState.flaggedForReview && flagRemaining === 0 ? (
        <Text style={styles.hintMuted}>
          An admin will review this court. Flag votes currently outweigh verifications.
        </Text>
      ) : null}

      <View style={styles.voteRow}>
        <Pressable
          style={[
            styles.voteBtn,
            voteState.myVote === 'verify' && styles.voteBtnVerifyActive,
          ]}
          onPress={onVerifyPress}
          disabled={voting}
        >
          {voting && voteState.myVote !== 'flag' ? (
            <ActivityIndicator size="small" color={colors.success} />
          ) : (
            <Ionicons
              name={
                voteState.myVote === 'verify'
                  ? 'checkmark-circle'
                  : 'checkmark-circle-outline'
              }
              size={20}
              color={voteState.myVote === 'verify' ? colors.text : colors.success}
            />
          )}
          <Text
            style={[
              styles.voteBtnText,
              voteState.myVote === 'verify' && styles.voteBtnTextActive,
            ]}
          >
            Verify ({voteState.verifyCount})
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.voteBtn,
            voteState.myVote === 'flag' && styles.voteBtnFlagActive,
          ]}
          onPress={onFlagPress}
          disabled={voting}
        >
          {voting && voteState.myVote === 'flag' ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <Ionicons
              name={voteState.myVote === 'flag' ? 'flag' : 'flag-outline'}
              size={20}
              color={voteState.myVote === 'flag' ? colors.text : colors.error}
            />
          )}
          <Text
            style={[
              styles.voteBtnText,
              voteState.myVote === 'flag' && styles.voteBtnTextActive,
            ]}
          >
            Flag ({voteState.flagCount})
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.soft,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  statusBadgeVerified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  statusBadgeVerifiedText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.success,
  },
  statusBadgeFlagged: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  statusBadgeFlaggedText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.error,
  },
  hint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  hintMuted: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  voteRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  voteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  voteBtnVerifyActive: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  voteBtnFlagActive: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  voteBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  voteBtnTextActive: {
    color: colors.text,
  },
});
