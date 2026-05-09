/**
 * Game State Management (Zustand)
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { RoundStatus, Bet } from '../../domain/types/game.types';

interface GameState {
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  currentRoundId: string | null;
  roundStatus: RoundStatus;
  liveMultiplier: number;
  bettingEndTime: Date | null;
  myActiveBet: Bet | null;
  currentBets: Bet[];
  // Computed values
  getBettingTimeRemaining: () => number; // seconds remaining
  getBettingProgress: () => number; // 0-1 progress for bar

  setConnectionStatus: (status: GameState['connectionStatus']) => void;
  setConnected: (connected: boolean) => void;
  setRoundStarted: (roundId: string, seedHash: string, bettingEndTime: Date) => void;
  setBettingEnded: () => void;
  setMultiplier: (multiplier: number) => void;
  setCrash: (crashPoint: number) => void;
  setMyActiveBet: (bet: Bet | null) => void;
  updateBetStatus: (betId: string, status: Bet['status'], cashOutData?: {
    multiplier: number;
    payoutCents: number;
    payoutDecimal: string;
  }) => void;
  setCurrentBets: (bets: Bet[]) => void;
  addBet: (bet: Bet) => void;
  updateBet: (betId: string, updates: Partial<Bet>) => void;
  resetRound: () => void;
}

const initialState = {
  isConnected: false,
  connectionStatus: 'disconnected' as const,
  currentRoundId: null,
  roundStatus: RoundStatus.BETTING,
  liveMultiplier: 1.0,
  bettingEndTime: null,
  myActiveBet: null,
  currentBets: [],
};

export const useGameStore = create<GameState>()(
  devtools<GameState>(
    (set, get) => ({
      ...initialState,

      setConnectionStatus: (status) => set({ connectionStatus: status }),
      setConnected: (connected) => set({ isConnected: connected }),

      setRoundStarted: (roundId, _seedHash, bettingEndTime) =>
        set({
          currentRoundId: roundId,
          roundStatus: RoundStatus.BETTING,
          liveMultiplier: 1.0,
          bettingEndTime,
          myActiveBet: null,
        }),

      setBettingEnded: () =>
        set({
          roundStatus: RoundStatus.ACTIVE,
          bettingEndTime: null,
        }),

      setMultiplier: (multiplier) =>
        set({ liveMultiplier: multiplier }),

      setCrash: (crashPoint) =>
        set({
          roundStatus: RoundStatus.CRASHED,
          liveMultiplier: crashPoint,
        }),

      setMyActiveBet: (bet) => set({ myActiveBet: bet }),

      updateBetStatus: (betId, status, cashOutData) =>
        set((state) => {
          if (state.myActiveBet?.id === betId) {
            return {
              myActiveBet: {
                ...state.myActiveBet!,
                status,
                ...(cashOutData && {
                  cashOutMultiplier: cashOutData.multiplier,
                  cashOutAmountCents: cashOutData.payoutCents,
                  cashOutAmountDecimal: cashOutData.payoutDecimal,
                  cashedOutAt: new Date(),
                }),
              },
            };
          }
          return {};
        }),

      resetRound: () =>
        set({
          currentRoundId: null,
          roundStatus: RoundStatus.BETTING,
          liveMultiplier: 1.0,
          bettingEndTime: null,
          myActiveBet: null,
          currentBets: [],
        }),

      setCurrentBets: (bets) => set({ currentBets: bets }),

      addBet: (bet) =>
        set((state) => ({
          currentBets: [...state.currentBets, bet],
        })),

      updateBet: (betId, updates) =>
        set((state) => ({
          currentBets: state.currentBets.map((bet) =>
            bet.id === betId ? { ...bet, ...updates } : bet
          ),
        })),

      // Computed getters
      getBettingTimeRemaining: () => {
        const state = get();
        if (!state.bettingEndTime || state.roundStatus !== RoundStatus.BETTING) {
          return 0;
        }
        const remaining = Math.max(0, (new Date(state.bettingEndTime).getTime() - Date.now()) / 1000);
        return remaining;
      },

      getBettingProgress: () => {
        const state = get();
        if (!state.bettingEndTime || state.roundStatus !== RoundStatus.BETTING) {
          return 0;
        }
        const BETTING_WINDOW_MS = 10000;
        const elapsed = Date.now() - (new Date(state.bettingEndTime).getTime() - BETTING_WINDOW_MS);
        return Math.min(1, Math.max(0, elapsed / BETTING_WINDOW_MS));
      },
    }),
    { name: 'GameStore' }
  )
);
