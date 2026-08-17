import { useAuth as useClerkAuth, useClerk } from '@clerk/expo';
import { useHostedAuth } from '@clerk/expo/hosted-auth';
import { ReactNode, createContext, useCallback, useContext, useMemo } from 'react';
import { AUTH_REDIRECT_URL } from '../lib/config';

type Session = { user: { id: string } };

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { isLoaded, isSignedIn, userId } = useClerkAuth();
  const clerk = useClerk();
  const { startHostedAuth } = useHostedAuth();

  const session = useMemo(() => (isSignedIn && userId ? { user: { id: userId } } : null), [isSignedIn, userId]);
  const loading = !isLoaded;

  const signIn = useCallback(async () => {
    const result = await startHostedAuth({ mode: 'sign-in', redirectUrl: AUTH_REDIRECT_URL });
    if (result.createdSessionId) return;

    if (!result.authSessionResult) {
      throw new Error('Sign-in is still starting. Wait a moment and try again.');
    }

    if (result.authSessionResult.type === 'cancel' || result.authSessionResult.type === 'dismiss') {
      throw new Error('Sign-in was closed before it finished. Please keep the Clerk window open until RackStage returns.');
    }

    throw new Error(`We could not complete sign-in (${result.authSessionResult.type}). Try again.`);
  }, [startHostedAuth]);

  const signOut = useCallback(async () => {
    await clerk.signOut();
  }, [clerk]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    loading,
    signIn,
    signOut,
  }), [loading, session, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
};
