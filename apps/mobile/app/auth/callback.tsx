import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '@/providers/auth';
import { Screen, Wordmark, colors } from '@/components/ui';

export default function AuthCallbackScreen() {
  const { loading, session } = useAuth();

  useEffect(() => {
    if (!loading && session) router.replace('/');
  }, [loading, session]);

  return <Screen scroll={false} style={{ justifyContent: 'center' }}>
    <View style={{ alignItems: 'center' }}>
      <Wordmark />
      <ActivityIndicator color={colors.accent} style={{ marginTop: 34 }} />
      <Text style={{ color: colors.muted, marginTop: 15 }}>Signing you in…</Text>
    </View>
  </Screen>;
}
