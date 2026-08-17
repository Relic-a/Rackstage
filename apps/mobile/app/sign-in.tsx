import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, ErrorNotice, Screen, SectionTitle, Wordmark, colors } from '@/components/ui';
import { useAuth } from '@/providers/auth';
import { hasClerkConfig } from '@/lib/config';

export default function SignInScreen() {
  const { signIn } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if (!hasClerkConfig) {
      setError('Seller auth is not configured in this build. Set the Clerk publishable key and restart Expo.');
      return;
    }
    setBusy(true);
    try {
      await signIn();
      router.replace('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not open the sign-in screen. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ marginTop: 30 }}><Wordmark /></View>
      <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 70 }}>
        <SectionTitle eyebrow="Seller workspace" title="Your one-of-one rack, online." detail="Sign in to photograph garments, publish them, and share a storefront your shoppers can trust." />
        {!hasClerkConfig ? <ErrorNotice message="Seller auth is not configured in this build. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY or EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, then restart Expo." /> : null}
        {error ? <ErrorNotice message={error} /> : null}
        <Button label="Continue to secure sign-in" onPress={submit} loading={busy} icon="arrow-forward" />
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 17 }}>Clerk will guide you through the enabled email, passwordless, or social sign-in methods.</Text>
      </View>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' }}>By continuing, you agree to use RackStage for your own store inventory.</Text>
    </Screen>
  );
}
