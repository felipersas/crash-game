/**
 * Game State Management (Zustand)
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { RoundStatus, Bet } from "@/types/game.types";
import type { ConnectionStatus } from "@/websocket/websocket.types";
import { GAME_CONSTANTS } from "@/constants/game";

interface GameState {
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  currentRoundId: string | null;
  roundStatus: RoundStatus;
  liveMultiplier: number;
  bettingEndTime: Date | null;
  roundStartedAt: Date | null;
  currentSeedHash: string | null;
  myActiveBet: Bet | null;
  currentBets: Bet[];
  getBettingTimeRemaining: () => number; // seconds remaining
  getBettingProgress: () => number; // 0-1 progress for bar

  setConnectionStatus: (status: GameState["connectionStatus"]) => void;
  setConnected: (connected: boolean) => void;
  setRoundStarted: (
    roundId: string,
    seedHash: string,
    bettingEndTime: Date,
    startedAt?: Date | null,
  ) => void;
  rejoinActiveRound: (
    roundId: string,
    seedHash: string,
    startedAt: Date,
    multiplier: number,
    bets: Bet[],
  ) => void;
  setBettingEnded: () => void;
  setMultiplier: (multiplier: number) => void;
  setCrash: (crashPoint: number) => void;
  setMyActiveBet: (bet: Bet | null) => void;
  updateBetStatus: (
    betId: string,
    status: Bet["status"],
    cashOutData?: {
      multiplier: number;
      payoutCents: number;
      payoutDecimal: string;
    },
  ) => void;
  setCurrentBets: (bets: Bet[]) => void;
  addBet: (bet: Bet) => void;
  updateBet: (betId: string, updates: Partial<Bet>) => void;
}

const initialState = {
  isConnected: false,
  connectionStatus: "disconnected" as const,
  currentRoundId: null,
  roundStatus: RoundStatus.BETTING,
  liveMultiplier: 1.0,
  bettingEndTime: null,
  roundStartedAt: null as Date | null,
  currentSeedHash: null as string | null,
  myActiveBet: null,
  currentBets: [],
};

export const useGameStore = create<GameState>()(
  devtools<GameState>(
    (set, get) => ({
      ...initialState,

      setConnectionStatus: (status) => set({ connectionStatus: status }),
      setConnected: (connected) => set({ isConnected: connected }),

      setRoundStarted: (roundId, seedHash, bettingEndTime, startedAt) =>
        set({
          currentRoundId: roundId,
          roundStatus: RoundStatus.BETTING,
          liveMultiplier: 1.0,
          bettingEndTime,
          roundStartedAt: startedAt ?? null,
          currentSeedHash: seedHash,
          myActiveBet: null,
          currentBets: [],
        }),

      rejoinActiveRound: (roundId, seedHash, startedAt, multiplier, bets) =>
        set({
          currentRoundId: roundId,
          roundStatus: RoundStatus.ACTIVE,
          liveMultiplier: multiplier,
          bettingEndTime: null,
          roundStartedAt: startedAt,
          currentSeedHash: seedHash,
          myActiveBet: null,
          currentBets: bets,
        }),

      setBettingEnded: () =>
        set((state) => ({
          roundStatus: RoundStatus.ACTIVE,
          bettingEndTime: null,
          roundStartedAt: state.roundStartedAt ?? new Date(),
        })),

      setMultiplier: (multiplier) => set({ liveMultiplier: multiplier }),

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
                  payoutCents: cashOutData.payoutCents,
                  payoutDecimal: cashOutData.payoutDecimal,
                  cashedOutAt: new Date(),
                }),
              },
            };
          }
          return {};
        }),

      setCurrentBets: (bets) => set({ currentBets: bets }),

      addBet: (bet) =>
        set((state) => {
          if (state.currentBets.some((b) => b.id === bet.id)) return {};
          return { currentBets: [...state.currentBets, bet] };
        }),

      updateBet: (betId, updates) =>
        set((state) => ({
          currentBets: state.currentBets.map((bet) =>
            bet.id === betId ? { ...bet, ...updates } : bet,
          ),
        })),

      getBettingTimeRemaining: () => {
        const state = get();
        if (
          !state.bettingEndTime ||
          state.roundStatus !== RoundStatus.BETTING
        ) {
          return 0;
        }
        const remaining = Math.max(
          0,
          (new Date(state.bettingEndTime).getTime() - Date.now()) / 1000,
        );
        return remaining;
      },

      getBettingProgress: () => {
        const state = get();
        if (
          !state.bettingEndTime ||
          state.roundStatus !== RoundStatus.BETTING
        ) {
          return 0;
        }
        const elapsed =
          Date.now() -
          (new Date(state.bettingEndTime).getTime() -
            GAME_CONSTANTS.BETTING_DURATION_MS);
        return Math.min(
          1,
          Math.max(0, elapsed / GAME_CONSTANTS.BETTING_DURATION_MS),
        );
      },
    }),
    { name: "GameStore" },
  ),
);
