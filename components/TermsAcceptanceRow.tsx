import { Pressable, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { colors, spacing } from '../constants/theme';
import { TERMS_ZERO_TOLERANCE_LINE } from '../constants/termsAcceptance';

type Props = {
  checked: boolean;
  onToggle: (checked: boolean) => void;
  termsHref?: Href;
};

export function TermsAcceptanceRow({
  checked,
  onToggle,
  termsHref = '/(auth)/terms-of-service',
}: Props) {
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          onPress={() => onToggle(!checked)}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel="Agree to Terms of Service"
        >
          <Ionicons
            name={checked ? 'checkbox' : 'square-outline'}
            size={22}
            color={checked ? colors.primary : colors.textMuted}
          />
        </Pressable>
        <Text style={styles.text}>
          I agree to the{' '}
          <Text style={styles.link} onPress={() => router.push(termsHref)}>
            Terms of Service
          </Text>
          , including the zero-tolerance rules for objectionable content.
        </Text>
      </View>
      <Text style={styles.zeroTolerance}>{TERMS_ZERO_TOLERANCE_LINE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  text: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  link: {
    color: colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  zeroTolerance: {
    marginTop: spacing.sm,
    marginLeft: 30,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
});
