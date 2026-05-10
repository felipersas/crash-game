/**
 * JWT Helper for E2E Tests
 *
 * Generates fake JWT tokens for testing. The UserContext decorator only
 * decodes the payload (signature verification is done by Kong Gateway),
 * so we can craft valid-looking tokens with arbitrary claims.
 */

export interface FakeJwtClaims {
  sub: string; // playerId
  email?: string;
  preferred_username?: string;
}

function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function createFakeJwt(claims: FakeJwtClaims): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify(claims));
  const signature = base64UrlEncode('fake-signature-for-e2e');
  return `${header}.${payload}.${signature}`;
}

export function authHeader(playerId: string): Record<string, string> {
  const token = createFakeJwt({
    sub: playerId,
    email: `${playerId}@e2e.test`,
    preferred_username: playerId,
  });
  return { Authorization: `Bearer ${token}` };
}
