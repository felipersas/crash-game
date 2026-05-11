'use client';

/**
 * useAuth - Authentication state and operations
 */

import { useSession, signIn, signOut } from 'next-auth/react';

const KEYCLOAK_PUBLIC_URL = process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080';

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
      signIn('keycloak', { callbackUrl: '/games' });
    },
    logout: () => {
      const idToken = session?.idToken;
      const params = new URLSearchParams({
        client_id: 'crash-game-client',
        post_logout_redirect_uri: window.location.origin + '/login',
      });
      if (idToken) params.set('id_token_hint', idToken);

      const keycloakLogoutUrl = `${KEYCLOAK_PUBLIC_URL}/realms/crash-game/protocol/openid-connect/logout?${params}`;
      signOut({ redirect: false })
        .then(() => { window.location.href = keycloakLogoutUrl; })
        .catch(() => { window.location.href = keycloakLogoutUrl; });
    },
  };
}
