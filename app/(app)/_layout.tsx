// app/(app)/_layout.tsx
import { Stack, Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { colors } from '../../constants/theme';

export default function AppLayout() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();

  if (authLoading || (user && profileLoading)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }
  if (!profile?.date_of_birth) {
    return <Redirect href="/(auth)/onboarding" />;
  }
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="court/[courtId]" />
      <Stack.Screen name="chat/[conversationId]" />
      <Stack.Screen name="friends/index" />
      <Stack.Screen name="court/add" />
      <Stack.Screen name="account" />
      <Stack.Screen name="privacy-policy" />
    </Stack>
  );
}
