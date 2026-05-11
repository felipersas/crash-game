import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

/**
 * User context extracted from JWT token.
 *
 * Kong Gateway validates JWT signature and expiration.
 * Service extracts claims from the validated token.
 *
 * Expected claims from Keycloak JWT:
 * - sub: User ID (subject)
 * - email: User email
 * - preferred_username: Username
 */
export interface UserContext {
  playerId: string;
  email: string;
  username: string;
}

function decodeBase64Url(base64Url: string): string {
  // Add padding if needed
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64').toString('utf-8');
}

function extractClaimsFromToken(authHeader: string): Record<string, unknown> {
  if (!authHeader) {
    throw new Error('Authorization header not found');
  }

  const token = authHeader.replace('Bearer ', '');
  const parts = token.split('.');

  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  // Decode payload (second part)
  const payload = decodeBase64Url(parts[1]);
  return JSON.parse(payload) as Record<string, unknown>;
}

export const UserContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserContext => {
    const request = ctx.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      throw new Error('Authorization header not found - request must come through Kong Gateway');
    }

    // Extract claims from JWT (signature already verified by Kong)
    const claims = extractClaimsFromToken(authHeader);

    const playerId = claims.sub as string;
    const email = (claims.email as string) || '';
    const username = (claims.preferred_username as string) || '';

    if (!playerId) {
      throw new Error('JWT missing required sub claim');
    }

    return { playerId, email, username };
  },
);
