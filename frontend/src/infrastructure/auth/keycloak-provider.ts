export const KeycloakProvider = {
  id: 'keycloak',
  name: 'Keycloak',
  type: 'oauth',
  issuer: process.env.KEYCLOAK_ISSUER,
  clientId: process.env.KEYCLOAK_CLIENT_ID,
  authorization: { params: { pkce: true } },
};
