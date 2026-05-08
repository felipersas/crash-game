'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { createGamesApi } from '../infrastructure/api/games-api';
import { useGameStore } from '../infrastructure/store/game-store';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { BetStatus, RoundStatus, type Round, type Bet } from '../domain/types/game.types';
import type { PlaceBetResponse, CashOutResponse } from '../shared/schemas/api-schemas';

/**
 * Game operations hook
 *
 * Manages game state, bet placement, and cash out operations.
 * Combines TanStack Query for server state with Zustand for UI state.
 *
 * @example
 * ```ts
 * const { currentRound, placeBet, cashOut, isBettingPhase } = useGame();
 * ```
 */
export function useGame() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { setMyActiveBet, updateBetStatus, myActiveBet } = useGameStore();

  // Current round query with dynamic polling
  const currentRoundQuery = useQuery<Round>({
    queryKey: ['current-round'],
    queryFn: () => {
      const api = createGamesApi(session?.accessToken);
      return api.getCurrentRound();
    },
    refetchInterval: (query) => {
      // Poll faster during active phase for real-time multiplier
      return query.state.data?.status === RoundStatus.ACTIVE ? 1000 : 3000;
    },
  });

  // Place bet mutation
  const placeBetMutation = useMutation<PlaceBetResponse, Error, number>({
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
        playerId: session?.user?.playerId || '',
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
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to place bet');
    },
  });

  // Cash out mutation
  const cashOutMutation = useMutation<CashOutResponse, Error, void>({
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
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to cash out');
    },
  });

  const roundData: Round | undefined = currentRoundQuery.data;

  return {
    currentRound: roundData,
    isBettingPhase: roundData?.status === RoundStatus.BETTING,
    isActivePhase: roundData?.status === RoundStatus.ACTIVE,
    isCrashed: roundData?.status === RoundStatus.CRASHED,
    currentMultiplier: roundData?.currentMultiplier ?? 1.0,
    isLoading: currentRoundQuery.isLoading,
    placeBet: placeBetMutation.mutate,
    isPlacingBet: placeBetMutation.isPending,
    cashOut: cashOutMutation.mutate,
    isCashingOut: cashOutMutation.isPending,
  };
}
