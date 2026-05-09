'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { createGamesApi } from '../infrastructure/api/games-api';
import { useGameStore } from '../infrastructure/store/game-store';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { BetStatus, RoundStatus, type Round, type Bet } from '../domain/types/game.types';
import type { PlaceBetResponse, CashOutResponse } from '../shared/schemas/api-schemas';
import type { ApiError } from '../infrastructure/api/http-client';
import { getErrorMessage } from '../shared/constants/error-codes';

/**
 * Game operations hook
 *
 * Manages game state, bet placement, and cash out operations.
 * Combines TanStack Query for server state with Zustand for real-time UI state.
 *
 * IMPORTANT: Multiplier and round phase are managed by WebSocket via Zustand store.
 * This hook only provides REST-based mutations (bet placement, cash out) and
 * periodic polling during BETTING phase for round synchronization.
 *
 * @example
 * ```ts
 * const { placeBet, cashOut, isPlacingBet } = useGame();
 * // Get real-time state from useGameStore instead
 * const { liveMultiplier, roundStatus } = useGameStore();
 * ```
 */
export function useGame() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { setMyActiveBet, updateBetStatus, myActiveBet, roundStatus } = useGameStore();

  // Current round query with smart polling
  // Only poll during BETTING phase - ACTIVE phase is handled by WebSocket
  const currentRoundQuery = useQuery<Round>({
    queryKey: ['current-round'],
    queryFn: () => {
      const api = createGamesApi(session?.accessToken);
      return api.getCurrentRound();
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status ?? roundStatus;
      // Don't poll during ACTIVE phase - WebSocket handles real-time updates
      if (status === RoundStatus.ACTIVE) {
        return false; // Disable polling during active phase
      }
      // Poll every 3 seconds during BETTING phase to sync round state
      return status === RoundStatus.BETTING ? 3000 : false;
    },
    // Only refetch on window focus during betting phase
    refetchOnWindowFocus: roundStatus === RoundStatus.BETTING,
  });

  // Place bet mutation
  const placeBetMutation = useMutation<PlaceBetResponse, ApiError, number>({
    mutationFn: (amountCents: number) => {
      const api = createGamesApi(session?.accessToken);
      return api.placeBet(amountCents);
    },
    onSuccess: (data: PlaceBetResponse) => {
      toast.success('Bet placed!');

      // Update local store with new bet
      const newBet: Bet = {
        id: data.betId,
        roundId: data.roundId,
        playerId: session?.playerId || '',
        amountCents: data.amountCents,
        amountDecimal: (data.amountCents / 100).toFixed(2),
        status: data.status,
        cashOutMultiplier: null,
        cashOutAmountCents: null,
        cashOutAmountDecimal: null,
        cashedOutAt: null,
      };

      setMyActiveBet(newBet);

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['current-round'] });
    },
    onError: (error: ApiError) => {
      toast.error(getErrorMessage(error.code, error.message));
    },
  });

  // Cash out mutation
  const cashOutMutation = useMutation<CashOutResponse, ApiError, void>({
    mutationFn: () => {
      if (!myActiveBet) throw new Error('No active bet to cash out');

      const api = createGamesApi(session?.accessToken);
      return api.cashOut(uuidv4(), myActiveBet.roundId);
    },
    onSuccess: (data: CashOutResponse) => {
      toast.success(`Cashed out at ${data.cashOutMultiplier.toFixed(2)}x!`);

      // Update bet status in store
      updateBetStatus(data.betId, BetStatus.CASHED_OUT, {
        multiplier: data.cashOutMultiplier,
        payoutCents: data.payoutCents,
        payoutDecimal: data.payoutDecimal,
      });

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['current-round'] });
    },
    onError: (error: ApiError) => {
      toast.error(getErrorMessage(error.code, error.message));
    },
  });

  const roundData: Round | undefined = currentRoundQuery.data;

  return {
    currentRound: roundData,
    isLoading: currentRoundQuery.isLoading,
    placeBet: placeBetMutation.mutate,
    isPlacingBet: placeBetMutation.isPending,
    cashOut: cashOutMutation.mutate,
    isCashingOut: cashOutMutation.isPending,
  };
}
