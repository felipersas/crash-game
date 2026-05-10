/**
 * NextAuth Middleware - Protect routes
 */

import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth({
  callbacks: {
    authorized({ token, req }) {
      const { pathname } = req.nextUrl;

      // Public routes - no auth required
      if (
        pathname === '/games' ||
        pathname.startsWith('/games/rounds/history') ||
        pathname.match(/^\/games\/rounds\/[^/]+\/verify$/)
      ) {
        return true;
      }

      // All other /games routes require auth
      return !!token;
    },
  },
});

export const config = {
  matcher: ['/games/:path*'],
};
