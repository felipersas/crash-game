export const API_ENDPOINTS = {
  GAMES: {
    BET: '/games/bet',
    CASHOUT: '/games/bet/cashout',
    CURRENT_ROUND: '/games/rounds/current',
    ROUND_HISTORY: '/games/rounds/history',
    VERIFY_ROUND: (roundId: string) => `/games/rounds/${roundId}/verify`,
    MY_BETS: '/games/bets/me',
  },
  WALLETS: {
    CREATE: '/wallets',
    ME: '/wallets/me',
  },
} as const;
