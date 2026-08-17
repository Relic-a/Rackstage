import Constants from 'expo-constants';
import * as Linking from 'expo-linking';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

const developmentApiUrl = () => {
  const hostUri = Constants.expoConfig?.hostUri;
  if (__DEV__ && hostUri) {
    const host = hostUri.replace(/^https?:\/\//, '').split(':')[0];
    if (host) return `http://${host}:3000`;
  }
  return 'http://localhost:3000';
};

export const API_BASE_URL = String(
  process.env.EXPO_PUBLIC_API_BASE_URL ?? extra.apiBaseUrl ?? developmentApiUrl(),
).replace(/\/$/, '');

export const CLERK_PUBLISHABLE_KEY = String(
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? extra.clerkPublishableKey ?? '',
);
export const hasClerkConfig = Boolean(CLERK_PUBLISHABLE_KEY);

export const AUTH_REDIRECT_URL = String(
  process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL ?? extra.authRedirectUrl ?? Linking.createURL('auth/callback'),
);
