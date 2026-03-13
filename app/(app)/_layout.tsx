// app/(app)/_layout.tsx
import { Stack, Redirect } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/theme';

export default function AppLayout() {
  const {user, loading} = useAuth();
  if (loading) {
    return <ActivityIndicator size="large" color={colors.primary} />;
  }
  if (!loading && !user) {
    return <Redirect href="/(auth)/login" />;
  }
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
