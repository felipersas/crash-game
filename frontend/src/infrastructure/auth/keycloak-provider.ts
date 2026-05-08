/**
 * Keycloak OAuth Provider Configuration
 *
 * Configures Keycloak as an OpenID Connect provider using PKCE flow.
 * The Keycloak realm must be configured with the client as 'public' access type.
 */

const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/realms/crash-game';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'crash-game-client';

export const KeycloakProvider: any = {
  id: 'keycloak',
  name: 'Keycloak',
  type: 'oauth',
  authorization: {
    params: {
      pkce: true,
    },
  },
  token: `${KEYCLOAK_ISSUER}/protocol/openid-connect/token`,
  userinfo: `${KEYCLOAK_ISSUER}/protocol/openid-connect/userinfo`,
  issuer: KEYCLOAK_ISSUER,
  profile(profile: any) {
    return {
      id: profile.sub,
      name: profile.name ?? profile.preferred_username,
      email: profile.email,
      image: profile.picture,
      playerId: profile.sub, // Keycloak sub becomes playerId
    };
  },
  clientId: KEYCLOAK_CLIENT_ID,
  // Client secret is empty for public clients (PKCE only)
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
};
