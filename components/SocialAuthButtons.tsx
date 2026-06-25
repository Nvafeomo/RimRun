import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
        <Text style={styles.dividerText}>or sign in with</Text>
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
        style={[
          styles.googleBtn,
          (disabled || loading || appleLoading) && styles.btnDisabled,
        ]}
        onPress={onGooglePress}
        disabled={disabled || loading || appleLoading}
        activeOpacity={0.88}
      >
        {loading ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <View style={styles.googleBtnContent}>
            <Ionicons name="logo-google" size={20} color="#000000" />
            <Text style={styles.googleBtnText}>Sign in with Google</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm,
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
  googleBtn: {
    height: 50,
    width: '100%',
    borderRadius: borderRadius.md,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  googleBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  googleBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
    letterSpacing: -0.2,
  },
});
