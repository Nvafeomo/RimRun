import { useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { REPORT_REASONS, type ReportReasonValue } from "../lib/reportReasons";
import { submitContentReport } from "../lib/reports";
import { colors, spacing, borderRadius } from "../constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** User being reported (omit for court-only / general court issue). */
  reportedUserId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  courtId?: string | null;
  /** Shown in subtitle for context */
  contextLabel?: string;
};

export function ReportUserModal({
  visible,
  onClose,
  reportedUserId,
  conversationId,
  messageId,
  courtId,
  contextLabel,
}: Props) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<ReportReasonValue | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setReason(null);
    setDetails("");
  };

  const handleClose = () => {
    if (!submitting) {
      reset();
      onClose();
    }
  };

  const submit = async () => {
    if (!reason) {
      Alert.alert("Choose a reason", "Select what best describes the issue.");
      return;
    }
    if (!reportedUserId && !courtId) {
      Alert.alert("Error", "Missing report target.");
      return;
    }
    setSubmitting(true);
    const res = await submitContentReport({
      reason,
      details: details.trim() || undefined,
      reportedUserId: reportedUserId ?? null,
      conversationId: conversationId ?? null,
      messageId: messageId ?? null,
      courtId: courtId ?? null,
    });
    setSubmitting(false);
    if (!res.ok) {
      Alert.alert("Could not submit", res.error);
      return;
    }
    if (res.deduped) {
      Alert.alert(
        "Already reported",
        "You already submitted a similar report recently. Our team will review it.",
      );
    } else {
      Alert.alert(
        "Report sent",
        "Thanks — we review reports as soon as we can. You can block the user anytime from their profile.",
      );
    }
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View
        style={[
          styles.root,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.iconBtn} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>Report</Text>
          <View style={{ width: 34 }} />
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {contextLabel ? (
            <Text style={styles.context}>{contextLabel}</Text>
          ) : null}
          <Text style={styles.label}>Reason</Text>
          {REPORT_REASONS.map((r) => (
            <Pressable
              key={r.value}
              style={[
                styles.reasonRow,
                reason === r.value && styles.reasonRowActive,
              ]}
              onPress={() => setReason(r.value)}
            >
              <Ionicons
                name={reason === r.value ? "radio-button-on" : "radio-button-off"}
                size={22}
                color={reason === r.value ? colors.primary : colors.textMuted}
              />
              <Text style={styles.reasonText}>{r.label}</Text>
            </Pressable>
          ))}
          <Text style={styles.label}>Details (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Add context that helps reviewers…"
            placeholderTextColor={colors.textMuted}
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={2000}
            editable={!submitting}
          />
          <Pressable
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={() => void submit()}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>Submit report</Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBtn: { padding: spacing.xs },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  context: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  reasonRowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceElevated,
  },
  reasonText: { flex: 1, fontSize: 16, color: colors.text },
  input: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: 15,
    textAlignVertical: "top",
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
