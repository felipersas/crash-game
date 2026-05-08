'use client';

/**
 * useAuth - Authentication state and operations
 */

import { useSession, signIn, signOut } from 'next-auth/react';

export function useAuth() {
  const { data: session, status } = useSession();
  
  return {
    session,
    status,
    isAuthenticated: status === 'authenticated',
    user: session?.user,
    playerId: session?.playerId,
    accessToken: session?.accessToken,
    login: () => {
      signIn('keycloak', { callbackUrl: '/game' });
    },
    logout: () => signOut({ callbackUrl: '/login' }),
  };
}
