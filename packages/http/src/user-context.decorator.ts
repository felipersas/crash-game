import { createParamDecorator, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Authenticated player extracted from the Keycloak JWT.
 *
 * Kong validates the token signature and expiration before the request
 * reaches a service; services only read its claims:
 * - sub: player id
 * - email
 * - preferred_username
 */
export interface UserContext {
  playerId: string;
  email: string;
  username: string;
}

function decodeClaims(authorization: string): Record<string, unknown> {
  const [, payload] = authorization.replace(/^Bearer\s+/i, '').split('.');
  if (!payload) {
    throw new UnauthorizedException('Invalid JWT format');
  }

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as Record<
      string,
      unknown
    >;
  } catch {
    throw new UnauthorizedException('Invalid JWT payload');
  }
}

export const UserContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserContext => {
    const authorization = ctx.switchToHttp().getRequest<Request>().headers.authorization;
    if (!authorization) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const claims = decodeClaims(authorization);
    if (typeof claims.sub !== 'string' || !claims.sub) {
      throw new UnauthorizedException('JWT missing required sub claim');
    }

    return {
      playerId: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : '',
      username: typeof claims.preferred_username === 'string' ? claims.preferred_username : '',
    };
  },
);
