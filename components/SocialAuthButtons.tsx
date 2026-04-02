import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, borderRadius } from '../constants/theme';

type SocialAuthButtonsProps = {
  onGooglePress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

export function SocialAuthButtons({
  onGooglePress,
  disabled,
  loading,
}: SocialAuthButtonsProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or continue with</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity
        style={[styles.socialBtn, styles.googleBtn]}
        onPress={onGooglePress}
        disabled={disabled || loading}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={styles.socialBtnText}>Continue with Google</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  socialBtn: {
    height: 50,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  googleBtn: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
  },
  socialBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
});
