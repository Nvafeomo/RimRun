import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, borderRadius } from "../constants/theme";

export type CourtDetailTagVariant =
  | "default"
  | "positive"
  | "warning"
  | "danger"
  | "muted"
  | "primary";

export type CourtDetailTagItem = {
  key: string;
  label: string;
  variant?: CourtDetailTagVariant;
};

type Props = {
  tags: CourtDetailTagItem[];
};

const variantStyles: Record<
  CourtDetailTagVariant,
  { bg: string; border: string; text: string }
> = {
  default: {
    bg: colors.surfaceElevated,
    border: colors.border,
    text: colors.textSecondary,
  },
  positive: {
    bg: "rgba(34, 197, 94, 0.12)",
    border: "rgba(34, 197, 94, 0.35)",
    text: colors.success,
  },
  warning: {
    bg: "rgba(232, 93, 4, 0.12)",
    border: "rgba(232, 93, 4, 0.35)",
    text: colors.primaryLight,
  },
  danger: {
    bg: "rgba(239, 68, 68, 0.14)",
    border: "rgba(239, 68, 68, 0.45)",
    text: colors.error,
  },
  muted: {
    bg: colors.surface,
    border: colors.border,
    text: colors.textMuted,
  },
  primary: {
    bg: colors.primary,
    border: colors.primaryLight,
    text: colors.text,
  },
};

function CourtDetailTagChip({
  label,
  variant = "default",
}: Pick<CourtDetailTagItem, "label" | "variant">) {
  const palette = variantStyles[variant];
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.chipText, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

/** Wrapping tag row for court detail (amenities and more can be appended later). */
export function CourtDetailTags({ tags }: Props) {
  if (tags.length === 0) return null;
  return (
    <View style={styles.row}>
      {tags.map(({ key, label, variant }) => (
        <CourtDetailTagChip key={key} label={label} variant={variant} />
      ))}
    </View>
  );
}

/** Tags from community `verified` / `flagged_for_review` columns on courts. */
export function buildCoreCourtDetailTags(court: {
  verified?: boolean | null;
  flagged_for_review?: boolean | null;
  is_private: boolean | null;
  is_indoor: boolean | null;
}): CourtDetailTagItem[] {
  const tags: CourtDetailTagItem[] = [
    {
      key: 'verified',
      label: court.verified ? 'Verified' : 'Unverified',
      variant: court.verified ? 'positive' : 'warning',
    },
    {
      key: 'access',
      label: court.is_private ? 'Private' : 'Public',
      variant: court.is_private ? 'warning' : 'default',
    },
    {
      key: 'indoor',
      label: court.is_indoor ? 'Indoor' : 'Outdoor',
      variant: court.is_indoor ? 'default' : 'primary',
    },
  ];

  if (court.flagged_for_review) {
    tags.push({
      key: 'flagged',
      label: 'Flagged',
      variant: 'danger',
    });
  }

  return tags;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
