import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors, spacing, borderRadius } from '../constants/theme';

type SocialAuthButtonsProps = {
  onGooglePress: () => void;
  onApplePress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  appleLoading?: boolean;
};

export function SocialAuthButtons({
  onGooglePress,
  onApplePress,
  disabled,
  loading,
  appleLoading,
}: SocialAuthButtonsProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or continue with</Text>
        <View style={styles.dividerLine} />
      </View>

      {Platform.OS === 'ios' && onApplePress ? (
        <View
          style={[styles.appleBtnWrap, (disabled || loading || appleLoading) && styles.btnDisabled]}
          pointerEvents={(disabled || loading || appleLoading) ? 'none' : 'auto'}
        >
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={borderRadius.md}
            style={styles.appleBtn}
            onPress={onApplePress}
          />
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.socialBtn, styles.googleBtn]}
        onPress={onGooglePress}
        disabled={disabled || loading || appleLoading}
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
  appleBtnWrap: {
    marginBottom: spacing.sm,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  appleBtn: {
    height: 50,
    width: '100%',
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
