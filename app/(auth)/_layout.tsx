// app/(auth)/_layout.tsx
import { Stack, Redirect, useSegments } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { View, ActivityIndicator, Text } from 'react-native';
import { colors } from '../../constants/theme';

export default function AuthLayout() {
  const { user, loading, banBlocked } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const segments = useSegments();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 12, color: colors.textSecondary, fontSize: 16 }}>Loading...</Text>
      </View>
    );
  }

  if (banBlocked) {
    return <Redirect href="/(banned)" />;
  }

  // Router guard: logged-in users leave login/signup; incomplete profiles go to onboarding.
  const currentScreen = segments.at(1) ?? '';
  const isOnAuthScreen = segments[0] === '(auth)' && currentScreen !== '';
  const isOnOnboarding = currentScreen === 'onboarding';
  const isOnResetPassword = currentScreen === 'reset-password';
  const isOnTermsOfService = currentScreen === 'terms-of-service';
  const shouldLeaveAuthScreen =
    user &&
    isOnAuthScreen &&
    !isOnOnboarding &&
    !isOnResetPassword &&
    !isOnTermsOfService;

  // If not logged in and trying to access onboarding, redirect to login
  const shouldRedirectToLogin = !user && isOnOnboarding;

  if (shouldLeaveAuthScreen) {
    if (profileLoading) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }
    if (!profile?.date_of_birth) {
      return <Redirect href="/(auth)/onboarding" />;
    }
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
      <Stack.Screen name="terms-of-service" />
    </Stack>
  );
}