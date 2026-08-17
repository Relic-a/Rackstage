import type { ExpoConfig } from 'expo/config';

/**
 * Only public client values are copied into the Expo runtime.
 * Never add SUPABASE_SECRET_KEY, SUPABASE_DATABASE_CONNECTION_STRING, or
 * YOUCAM_API_KEY here: those values belong exclusively in the trusted server.
 */
const appConfig = ({ config }: { config: ExpoConfig }): ExpoConfig => ({
  ...config,
  extra: {
    ...config.extra,
    clerkPublishableKey:
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    authRedirectUrl: process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL,
  },
});

export default appConfig;
