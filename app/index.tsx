import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { View, ActivityIndicator, Text } from 'react-native';
import { colors } from '../constants/theme';
import { hasPendingPasswordRecovery } from '../lib/supabaseAuthDeepLink';

export default function Index() {
  const { user, loading } = useAuth();
  const [recoveryPending, setRecoveryPending] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    void (async () => {
      const pending = await hasPendingPasswordRecovery();
      if (!cancelled) setRecoveryPending(pending);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  if (loading || recoveryPending === null) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 12, color: colors.textSecondary, fontSize: 16 }}>Loading...</Text>
      </View>
    );
  }

  if (user && recoveryPending) {
    return <Redirect href="/(auth)/reset-password" />;
  }

  return <Redirect href={user ? '/(app)' : '/(auth)/login'} />;
}
