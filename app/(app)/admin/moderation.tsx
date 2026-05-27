import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Redirect, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useProfile } from '../../../context/ProfileContext';
import { colors, spacing, borderRadius } from '../../../constants/theme';
import { REPORT_REASONS } from '../../../lib/reportReasons';
import {
  banUserViaEdge,
  dismissReport,
  fetchOpenReports,
  fetchPendingAppeals,
  isAdminRole,
  reviewBanAppeal,
  type AdminAppealRow,
  type AdminReportRow,
} from '../../../lib/moderation';

function reasonLabel(value: string): string {
  return REPORT_REASONS.find((r) => r.value === value)?.label ?? value;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function AdminModerationScreen() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const [reports, setReports] = useState<AdminReportRow[]>([]);
  const [appeals, setAppeals] = useState<AdminAppealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [banTarget, setBanTarget] = useState<AdminReportRow | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banning, setBanning] = useState(false);
  const [actingReportId, setActingReportId] = useState<string | null>(null);
  const [actingAppealId, setActingAppealId] = useState<string | null>(null);

  const loadModeration = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');
    const [reportsResult, appealsResult] = await Promise.all([
      fetchOpenReports(),
      fetchPendingAppeals(),
    ]);
    if (!reportsResult.ok) {
      setError(reportsResult.error);
      setReports([]);
    } else {
      setReports(reportsResult.reports);
    }
    if (!appealsResult.ok) {
      if (!reportsResult.ok) {
        setError(`${reportsResult.error}; ${appealsResult.error}`);
      } else {
        setError(appealsResult.error);
      }
      setAppeals([]);
    } else {
      setAppeals(appealsResult.appeals);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isAdminRole(profile?.role)) {
        void loadModeration();
      }
    }, [loadModeration, profile?.role]),
  );

  const exitModeration = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)/(tabs)/profile');
    }
  }, [router]);

  if (profileLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!isAdminRole(profile?.role)) {
    return <Redirect href="/(app)/(tabs)/profile" />;
  }

  async function handleReviewAppeal(
    appeal: AdminAppealRow,
    decision: 'approved' | 'denied',
  ) {
    const title = decision === 'approved' ? 'Approve appeal' : 'Deny appeal';
    const message =
      decision === 'approved'
        ? 'Lift this user’s ban and allow them back into RimRun?'
        : 'Deny this appeal? The ban stays in effect.';
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: decision === 'approved' ? 'Approve' : 'Deny',
        style: decision === 'approved' ? 'default' : 'destructive',
        onPress: async () => {
          setActingAppealId(appeal.id);
          const result = await reviewBanAppeal(appeal.id, decision);
          setActingAppealId(null);
          if (!result.ok) {
            Alert.alert('Action failed', result.error);
            return;
          }
          void loadModeration(true);
        },
      },
    ]);
  }

  function openBanModal(report: AdminReportRow) {
    if (!report.reported_user_id) {
      Alert.alert(
        'Cannot ban',
        'This report has no reported user attached (e.g. court-only report).',
      );
      return;
    }
    setBanReason(`Banned after report: ${reasonLabel(report.reason)}`);
    setBanTarget(report);
  }

  async function confirmBan() {
    if (!banTarget?.reported_user_id) return;
    setBanning(true);
    const result = await banUserViaEdge({
      userId: banTarget.reported_user_id,
      reason: banReason,
      reportId: banTarget.id,
    });
    setBanning(false);
    if (!result.ok) {
      Alert.alert('Ban failed', result.error);
      return;
    }
    setBanTarget(null);
    setBanReason('');
    Alert.alert('User banned', 'The account was suspended and signed out.');
    void loadModeration(true);
  }

  async function handleDismiss(report: AdminReportRow) {
    Alert.alert(
      'Dismiss report',
      'Mark this report as dismissed without banning?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dismiss',
          onPress: async () => {
            setActingReportId(report.id);
            const result = await dismissReport(report.id);
            setActingReportId(null);
            if (!result.ok) {
              Alert.alert('Could not dismiss', result.error);
              return;
            }
            void loadModeration(true);
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={exitModeration}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Moderation</Text>
        <View style={styles.backButton} />
      </View>

      <Text style={styles.subtitle}>
        Review open reports and ban appeals.
      </Text>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadModeration(true)}
              tintColor={colors.primary}
            />
          }
        >
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => void loadModeration()}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.sectionHeading}>Ban appeals</Text>
          {appeals.length === 0 ? (
            <Text style={styles.sectionEmpty}>No pending appeals</Text>
          ) : (
            appeals.map((appeal) => {
              const busy = actingAppealId === appeal.id;
              return (
                <View key={appeal.id} style={[styles.card, styles.appealCard]}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.reason}>
                      {appeal.username ?? appeal.user_id.slice(0, 8)}
                    </Text>
                    <Text style={styles.when}>{formatWhen(appeal.created_at)}</Text>
                  </View>
                  <Text style={styles.details}>{appeal.message}</Text>
                  <View style={styles.actions}>
                    <Pressable
                      style={styles.secondaryAction}
                      onPress={() => router.push(`/(app)/user/${appeal.user_id}`)}
                    >
                      <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
                      <Text style={styles.secondaryActionText}>Profile</Text>
                    </Pressable>
                    <Pressable
                      style={styles.secondaryAction}
                      onPress={() => void handleReviewAppeal(appeal, 'denied')}
                      disabled={busy}
                    >
                      <Text style={styles.secondaryActionText}>Deny</Text>
                    </Pressable>
                    <Pressable
                      style={styles.approveAction}
                      onPress={() => void handleReviewAppeal(appeal, 'approved')}
                      disabled={busy}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color={colors.text} />
                      ) : (
                        <Text style={styles.approveActionText}>Approve</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}

          <Text style={styles.sectionHeading}>Open reports</Text>
          {reports.length === 0 && !error ? (
            <Text style={styles.sectionEmpty}>No open reports</Text>
          ) : null}

          {reports.length === 0 && !error && appeals.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="checkmark-circle-outline" size={40} color={colors.success} />
              <Text style={styles.emptyTitle}>All clear</Text>
              <Text style={styles.emptyBody}>No pending moderation items.</Text>
            </View>
          ) : null}

          {reports.map((report) => {
            const busy = actingReportId === report.id;
            return (
              <View key={report.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.reason}>{reasonLabel(report.reason)}</Text>
                  <Text style={styles.when}>{formatWhen(report.created_at)}</Text>
                </View>

                <Text style={styles.meta}>
                  Reporter:{' '}
                  <Text style={styles.metaStrong}>
                    {report.reporter_username ?? report.reporter_id.slice(0, 8)}
                  </Text>
                </Text>
                {report.reported_user_id ? (
                  <Text style={styles.meta}>
                    Reported:{' '}
                    <Text style={styles.metaStrong}>
                      {report.reported_username ??
                        report.reported_user_id.slice(0, 8)}
                    </Text>
                  </Text>
                ) : (
                  <Text style={styles.metaMuted}>No reported user on this report</Text>
                )}
                {report.details ? (
                  <Text style={styles.details} numberOfLines={4}>
                    {report.details}
                  </Text>
                ) : null}

                <View style={styles.actions}>
                  {report.reported_user_id ? (
                    <Pressable
                      style={styles.secondaryAction}
                      onPress={() =>
                        router.push(`/(app)/user/${report.reported_user_id}`)
                      }
                    >
                      <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
                      <Text style={styles.secondaryActionText}>Profile</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={styles.secondaryAction}
                    onPress={() => void handleDismiss(report)}
                    disabled={busy}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color={colors.textSecondary} />
                    ) : (
                      <>
                        <Ionicons name="close-circle-outline" size={18} color={colors.textSecondary} />
                        <Text style={styles.secondaryActionText}>Dismiss</Text>
                      </>
                    )}
                  </Pressable>
                  {report.reported_user_id ? (
                    <Pressable
                      style={styles.banAction}
                      onPress={() => openBanModal(report)}
                      disabled={busy}
                    >
                      <Ionicons name="ban" size={18} color={colors.text} />
                      <Text style={styles.banActionText}>Ban user</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <Modal
        visible={banTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => !banning && setBanTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => !banning && setBanTarget(null)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Ban user</Text>
            <Text style={styles.modalBody}>
              Permanently suspend{' '}
              <Text style={styles.metaStrong}>
                {banTarget?.reported_username ?? 'this user'}
              </Text>
              ? They will be signed out and blocked from the app.
            </Text>
            <Text style={styles.inputLabel}>Internal reason (optional)</Text>
            <TextInput
              style={styles.input}
              value={banReason}
              onChangeText={setBanReason}
              placeholder="Reason stored for admin records"
              placeholderTextColor={colors.textMuted}
              multiline
              editable={!banning}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => setBanTarget(null)}
                disabled={banning}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalConfirm}
                onPress={() => void confirmBan()}
                disabled={banning}
              >
                {banning ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <Text style={styles.modalConfirmText}>Ban user</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const cardShadow =
  Platform.OS === 'ios'
    ? {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      }
    : { elevation: 4 };

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl * 2,
    gap: spacing.md,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  retryText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  emptyBody: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  sectionEmpty: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.md,
    alignSelf: 'flex-start',
  },
  appealCard: {
    borderColor: 'rgba(232, 93, 4, 0.35)',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  reason: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  when: {
    fontSize: 12,
    color: colors.textMuted,
  },
  meta: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  metaStrong: {
    color: colors.text,
    fontWeight: '600',
  },
  metaMuted: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  details: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  banAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.error,
  },
  banActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  approveAction: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.success,
    minWidth: 88,
    alignItems: 'center',
  },
  approveActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 20, 25, 0.75)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  modalBody: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.inputBg,
    textAlignVertical: 'top',
    marginBottom: spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  modalCancel: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modalConfirm: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.error,
    minWidth: 108,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
});
