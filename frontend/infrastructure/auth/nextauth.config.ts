import type { NextAuthOptions } from 'next-auth';
import { KeycloakProvider } from './keycloak-provider';

const KEYCLOAK_ISSUER =
  process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/realms/crash-game';
const KEYCLOAK_CLIENT_ID =
  process.env.KEYCLOAK_CLIENT_ID || 'crash-game-client';
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || '';

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(
    `${KEYCLOAK_ISSUER}/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: KEYCLOAK_CLIENT_ID,
        ...(KEYCLOAK_CLIENT_SECRET && {
          client_secret: KEYCLOAK_CLIENT_SECRET,
        }),
      }),
    }
  );

  if (!res.ok) throw new Error('RefreshAccessTokenError');

  const tokens = await res.json();
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 300),
    idToken: tokens.id_token,
  };
}

export const authOptions: NextAuthOptions = {
  providers: [KeycloakProvider],

  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.idToken = account.id_token;
      }

      if (profile) {
        token.playerId = profile.sub;
      }

      if (!token.expiresAt) return token;

      const remaining = (token.expiresAt as number) - Math.floor(Date.now() / 1000);
      if (remaining > 30) return token;

      try {
        const fresh = await refreshAccessToken(token.refreshToken as string);
        return { ...token, ...fresh, error: undefined };
      } catch {
        return { ...token, error: 'RefreshAccessTokenError' };
      }
    },

    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.playerId = token.playerId as string;
      session.idToken = token.idToken as string;
      session.error = token.error as string | undefined;
      return session;
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 60,
  },

  debug: process.env.NODE_ENV === 'development',
};
