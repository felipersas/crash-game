import type { OAuthConfig } from "next-auth/providers/oauth";

const KEYCLOAK_ISSUER =
  process.env.KEYCLOAK_ISSUER || "http://localhost:8080/realms/crash-game";
const KEYCLOAK_PUBLIC_URL =
  process.env.NEXT_PUBLIC_KEYCLOAK_URL || "http://localhost:8080";
const KEYCLOAK_CLIENT_ID =
  process.env.KEYCLOAK_CLIENT_ID || "crash-game-client";
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || "";

interface KeycloakProfile {
  sub: string;
  preferred_username?: string;
  name?: string;
  email?: string;
  picture?: string;
}

export const KeycloakProvider: OAuthConfig<KeycloakProfile> = {
  id: "keycloak",
  name: "Keycloak",
  type: "oauth",
  clientId: KEYCLOAK_CLIENT_ID,
  clientSecret: KEYCLOAK_CLIENT_SECRET,

  issuer: `${KEYCLOAK_PUBLIC_URL}/realms/crash-game`,

  authorization: {
    url: `${KEYCLOAK_PUBLIC_URL}/realms/crash-game/protocol/openid-connect/auth`,
    params: { scope: "openid email profile" },
  },

  token: `${KEYCLOAK_ISSUER}/protocol/openid-connect/token`,
  userinfo: `${KEYCLOAK_ISSUER}/protocol/openid-connect/userinfo`,

  jwks_endpoint: `${KEYCLOAK_ISSUER}/protocol/openid-connect/certs`,

  checks: ["state", "pkce"],

  profile(profile) {
    return {
      id: profile.sub,
      name: profile.preferred_username || profile.name || null,
      email: profile.email || null,
      image: profile.picture || null,
    };
  },
};
