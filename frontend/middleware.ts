/**
 * NextAuth Middleware - Protect routes
 */

import { withAuth } from 'next-auth/middleware';

export default withAuth({
  callbacks: {
    authorized({ token }) {
      return !!token;
    },
  },
});

export const config = {
  matcher: ['/game/:path*'],
};
