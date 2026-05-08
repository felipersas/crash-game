'use client';

/**
 * useAuth - Authentication state and operations
 */

import { useSession, signOut } from 'next-auth/react';

export function useAuth() {
  const { data: session, status } = useSession();
  
  return {
    session,
    status,
    isAuthenticated: status === 'authenticated',
    user: session?.user,
    login: () => {
      window.location.href = `/api/auth/signin`;
    },
    logout: () => signOut({ callbackUrl: '/login' }),
  };
}
