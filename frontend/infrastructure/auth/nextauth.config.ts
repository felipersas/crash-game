/**
 * NextAuth Configuration
 *
 * Configures authentication with Keycloak OAuth provider.
 * Handles JWT tokens, session data, and callback URLs.
 */

import type { NextAuthOptions } from 'next-auth';
import { KeycloakProvider } from './keycloak-provider';

export const authOptions: NextAuthOptions = {
  providers: [KeycloakProvider],

  callbacks: {
    /**
     * JWT callback - Called when token is created or updated
     * Stores the access_token for API calls
     */
    async jwt({ token, account, profile }) {
      // Initial sign in - store access token
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }

      // playerId = Keycloak sub claim (same UUID backend uses as playerId)
      if (profile) {
        token.playerId = profile.sub;
      }

      return token;
    },

    /**
     * Session callback - Called whenever session is checked
     * Adds access_token and playerId to the client session
     */
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.playerId = token.playerId as string;
      return session;
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  // Use JWT strategy (default for NextAuth v4)
  session: {
    strategy: 'jwt',
    maxAge: 30 * 60, // 30 minutes
  },

  // Enable debug in development
  debug: process.env.NODE_ENV === 'development',
};
