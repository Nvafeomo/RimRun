import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
export default function TabsLayout() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
    <Tabs
      screenOptions={{ headerShown: false }}
      initialRouteName="courts"
    >
      <Tabs.Screen name="courts" options={{ title: 'Courts', tabBarIcon: ({ color, size }) => <Ionicons name="basketball" color={color} size={size} /> }} />
      <Tabs.Screen name="chats" options={{ title: 'Chats', tabBarIcon: ({ color, size }) => <Ionicons name="chatbox" color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} /> }} />
    </Tabs>
    </SafeAreaView>
  );
}
