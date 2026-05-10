import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    playerId?: string;
    user: {
      playerId?: string;
      username?: string;
    };
  }

  interface Profile {
    playerId?: string;
    sub?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    playerId?: string;
    username?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  }
}
