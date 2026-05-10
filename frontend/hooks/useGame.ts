"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { placeBet, cashOut, getCurrentRound } from "@/infrastructure/api/games-api";
import { useGameStore } from "@/store/game-store";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import {
  BetStatus,
  RoundStatus,
  type Round,
  type Bet,
} from "@/types/game.types";
import type {
  PlaceBetResponse,
  CashOutResponse,
} from "@/shared/schemas/api-schemas";
import type { ApiError } from "../infrastructure/api/http-client";
import { getErrorMessage } from "@/shared/constants/error-codes";

/**
 * Game operations hook
 *
 * Manages game state, bet placement, and cash out operations.
 * Combines TanStack Query for server state with Zustand for real-time UI state.
 *
 * IMPORTANT: Multiplier and round phase are managed by WebSocket via Zustand store.
 * This hook only provides REST-based mutations (bet placement, cash out) and
 * periodic polling during BETTING phase for round synchronization.
 */
export function useGame() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const setMyActiveBet = useGameStore((s) => s.setMyActiveBet);
  const updateBetStatus = useGameStore((s) => s.updateBetStatus);
  const myActiveBet = useGameStore((s) => s.myActiveBet);
  const roundStatus = useGameStore((s) => s.roundStatus);

  const currentRoundQuery = useQuery<Round>({
    queryKey: ["current-round"],
    queryFn: getCurrentRound,
    refetchInterval: (query) => {
      const status = query.state.data?.status ?? roundStatus;
      if (status === RoundStatus.ACTIVE) {
        return false;
      }
      return status === RoundStatus.BETTING ? 3000 : false;
    },
    refetchOnWindowFocus: roundStatus === RoundStatus.BETTING,
  });

  const placeBetMutation = useMutation<PlaceBetResponse, ApiError, number>({
    mutationFn: placeBet,
    onSuccess: (data: PlaceBetResponse) => {
      const newBet: Bet = {
        id: data.betId,
        roundId: data.roundId,
        playerId: session?.playerId || "",
        amountCents: data.amountCents,
        amountDecimal: (data.amountCents / 100).toFixed(2),
        status: data.status,
        cashOutMultiplier: null,
        payoutCents: null,
        payoutDecimal: null,
        cashedOutAt: null,
      };

      setMyActiveBet(newBet);

      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      queryClient.invalidateQueries({ queryKey: ["current-round"] });
    },
    onError: (error: ApiError) => {
      toast.error(getErrorMessage(error.code, error.message));
    },
  });

  const cashOutMutation = useMutation<CashOutResponse, ApiError, void>({
    mutationFn: () => {
      if (!myActiveBet) throw new Error("No active bet to cash out");
      return cashOut(uuidv4(), myActiveBet.roundId);
    },
    onSuccess: (data: CashOutResponse) => {
      updateBetStatus(data.betId, BetStatus.CASHED_OUT, {
        multiplier: data.cashOutMultiplier,
        payoutCents: data.payoutCents,
        payoutDecimal: data.payoutDecimal,
      });

      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      queryClient.invalidateQueries({ queryKey: ["current-round"] });
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
