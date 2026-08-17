import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { AuthProvider } from '@/providers/auth';
import { StoreProvider } from '@/providers/store';
import { CLERK_PUBLISHABLE_KEY } from '@/lib/config';

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error('Add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY or EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to the Expo environment.');
}

export default function Layout() {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <AuthProvider>
        <StoreProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
        </StoreProvider>
      </AuthProvider>
    </ClerkProvider>
  );
}
