// app/_layout.tsx
import * as WebBrowser from 'expo-web-browser';
import '../global.css';

WebBrowser.maybeCompleteAuthSession();
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../context/AuthContext';
import { ProfileProvider } from '../context/ProfileContext';
import { CourtAliasesProvider } from '../context/CourtAliasesContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../constants/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AuthProvider>
          <ProfileProvider>
            <CourtAliasesProvider>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(app)" />
              </Stack>
            </CourtAliasesProvider>
          </ProfileProvider>
        </AuthProvider>
      </View>
    </SafeAreaProvider>
  );
}