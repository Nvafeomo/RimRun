import { Redirect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { View, ActivityIndicator, Text } from 'react-native';

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#333" />
        <Text style={{ marginTop: 12, color: '#333', fontSize: 16 }}>Loading...</Text>
      </View>
    );
  }

  return <Redirect href={user ? '/(app)' : '/(auth)/login'} />;
}
