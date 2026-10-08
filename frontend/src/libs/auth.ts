import type { NextAuthOptions } from 'next-auth';
import type { OAuthConfig } from 'next-auth/providers/oauth';

// ---------------------------------------------------------------------------
// Keycloak Provider Config
// ---------------------------------------------------------------------------

const KEYCLOAK_ISSUER =
  process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/realms/crash-game';
const KEYCLOAK_PUBLIC_URL =
  process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080';
const KEYCLOAK_CLIENT_ID =
  process.env.KEYCLOAK_CLIENT_ID || 'crash-game-client';
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || '';

interface KeycloakProfile {
  sub: string;
  preferred_username?: string;
  name?: string;
  email?: string;
  picture?: string;
}

const KeycloakProvider: OAuthConfig<KeycloakProfile> = {
  id: 'keycloak',
  name: 'Keycloak',
  type: 'oauth',
  clientId: KEYCLOAK_CLIENT_ID,
  clientSecret: KEYCLOAK_CLIENT_SECRET,

  issuer: `${KEYCLOAK_PUBLIC_URL}/realms/crash-game`,

  authorization: {
    url: `${KEYCLOAK_PUBLIC_URL}/realms/crash-game/protocol/openid-connect/auth`,
    params: { scope: 'openid email profile' },
  },

  token: `${KEYCLOAK_ISSUER}/protocol/openid-connect/token`,
  userinfo: `${KEYCLOAK_ISSUER}/protocol/openid-connect/userinfo`,

  jwks_endpoint: `${KEYCLOAK_ISSUER}/protocol/openid-connect/certs`,

  checks: ['state', 'pkce'],

  profile(profile) {
    return {
      id: profile.sub,
      name: profile.preferred_username || profile.name || null,
      email: profile.email || null,
      image: profile.picture || null,
    };
  },
};

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

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
    },
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

// ---------------------------------------------------------------------------
// NextAuth Options
// ---------------------------------------------------------------------------

export const authOptions: NextAuthOptions = {
  providers: [KeycloakProvider],

  callbacks: {
    async jwt({ token, account, profile, user }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.idToken = account.id_token;
      }

      if (profile?.sub) {
        token.playerId = profile.sub;
      }

      if (user?.name) {
        token.username = user.name;
      }

      if (!token.expiresAt) return token;

      const remaining = token.expiresAt - Math.floor(Date.now() / 1000);
      if (remaining > 30) return token;

      if (!token.refreshToken) return { ...token, error: 'RefreshAccessTokenError' };

      try {
        const fresh = await refreshAccessToken(token.refreshToken);
        return { ...token, ...fresh, error: undefined };
      } catch {
        return { ...token, error: 'RefreshAccessTokenError' };
      }
    },

    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.playerId = token.playerId;
      session.idToken = token.idToken;
      session.error = token.error;
      session.user.username = token.username;
      session.user.playerId = token.playerId;
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
