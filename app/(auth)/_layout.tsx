// app/(auth)/_layout.tsx
import { Stack, Redirect, useSegments } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { View, ActivityIndicator, Text } from 'react-native';
import { colors } from '../../constants/theme';

export default function AuthLayout() {
  const { user, loading } = useAuth();
  const segments = useSegments();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 12, color: colors.textSecondary, fontSize: 16 }}>Loading...</Text>
      </View>
    );
  }

  // Router guard: if user is logged in and on login/signup/reset-password, redirect to app
  // Allow onboarding — user may be completing it after signup
  const currentScreen = segments.at(1) ?? '';
  const isOnAuthScreen = segments[0] === '(auth)' && currentScreen !== '';
  const isOnOnboarding = currentScreen === 'onboarding';
  // Stay on reset-password until new password is set (recovery session)
  const shouldRedirectToApp =
    user && isOnAuthScreen && !isOnOnboarding && currentScreen !== 'reset-password';

  // If not logged in and trying to access onboarding, redirect to login
  const shouldRedirectToLogin = !user && isOnOnboarding;

  if (shouldRedirectToApp) {
    return <Redirect href="/(app)" />;
  }
  if (shouldRedirectToLogin) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }} initialRouteName="login">
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}