import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/providers/auth';
import { useStore } from '@/providers/store';
import { colors } from '@/components/ui';

export default function Index() {
  const { session, loading: authLoading } = useAuth();
  const { store, loading: storeLoading } = useStore();
  if (authLoading || (session && storeLoading)) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}><ActivityIndicator color={colors.accent} /></View>;
  }
  if (!session) return <Redirect href="/sign-in" />;
  if (!store) return <Redirect href="/onboarding" />;
  return <Redirect href="/dashboard" />;
}
