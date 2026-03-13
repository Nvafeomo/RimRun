import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { colors, spacing, borderRadius } from '../../../constants/theme';

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: spacing.lg }}>
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '600' }}>
        Profile
      </Text>
      <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>
        Your profile and settings
      </Text>

      <View style={{ flex: 1 }} />

      <TouchableOpacity
        onPress={handleSignOut}
        disabled={signingOut}
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          borderRadius: borderRadius.md,
          alignItems: 'center',
        }}
      >
        {signingOut ? (
          <ActivityIndicator color={colors.text} size="small" />
        ) : (
          <Text style={{ color: colors.error, fontSize: 16, fontWeight: '600' }}>
            Sign Out
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
