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

export const useGameStore = create<GameState>()(
  devtools(
    (set) => ({
      isConnected: false,
      connectionStatus: 'disconnected',
      currentRoundId: null,
      roundStatus: RoundStatus.BETTING,
      liveMultiplier: 1.0,
      bettingEndTime: null,
      myActiveBet: null,
      currentBets: [],
      
      setConnectionStatus: (status) => set({ connectionStatus: status }),
      setConnected: (connected) => set({ isConnected: connected }),
      
      setRoundStarted: (roundId, seedHash, bettingEndTime) =>
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
                ...state.myActiveBet,
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
          return state;
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
    }),
    { name: 'GameStore' }
  )
);
