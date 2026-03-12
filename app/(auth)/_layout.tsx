// app/(auth)/_layout.tsx
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} initialRouteName="login">
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}