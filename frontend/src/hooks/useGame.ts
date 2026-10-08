"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { placeBet, cashOut } from "@/libs/games-api";
import { useGameStore } from "@/store/game-store";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import {
  BetStatus,
  type Bet,
  type Wallet,
  type PlaceBetResponse,
  type CashOutResponse,
} from "@/types";
import type { ApiError } from "@/libs/axios";
import { getErrorMessage } from "@/constants/error-codes";
import { centsToDecimal } from "@/domain/money";
import { WALLET_QUERY_KEY } from "@/hooks/useWallet";

/**
 * Game operations hook
 *
 * REST-based mutations (bet placement, cash out). Round phase, multiplier and
 * bets are pushed by the WebSocket into the Zustand store — no polling here.
 */
export function useGame() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const setMyActiveBet = useGameStore((s) => s.setMyActiveBet);
  const updateBetStatus = useGameStore((s) => s.updateBetStatus);
  const myActiveBet = useGameStore((s) => s.myActiveBet);

  const placeBetMutation = useMutation<
    PlaceBetResponse,
    ApiError,
    { amountCents: number; autoCashOutAt?: number },
    { prev?: Wallet }
  >({
    mutationFn: ({ amountCents, autoCashOutAt }) => placeBet(amountCents, autoCashOutAt),
    onMutate: async ({ amountCents }) => {
      await queryClient.cancelQueries({ queryKey: WALLET_QUERY_KEY });
      const prev = queryClient.getQueryData<Wallet>(WALLET_QUERY_KEY);
      if (prev?.balance) {
        queryClient.setQueryData<Wallet>(WALLET_QUERY_KEY, {
          ...prev,
          balance: (BigInt(prev.balance) - BigInt(amountCents)).toString(),
        });
      }
      return { prev };
    },
    onSuccess: (data: PlaceBetResponse) => {
      const newBet: Bet = {
        id: data.betId,
        roundId: data.roundId,
        playerId: session?.playerId || "",
        playerName: session?.user?.username || "",
        amountCents: data.amountCents,
        amountDecimal: centsToDecimal(data.amountCents),
        // Always PENDING until the wallet debit is confirmed via WebSocket.
        status: BetStatus.PENDING,
        cashOutMultiplier: null,
        payoutCents: null,
        payoutDecimal: null,
        cashedOutAt: null,
        autoCashOutMultiplier: data.autoCashOutMultiplier ?? null,
      };

      setMyActiveBet(newBet);
      queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEY });
    },
    onError: (error: ApiError, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(WALLET_QUERY_KEY, context.prev);
      }
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
      queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEY });
    },
    onError: (error: ApiError) => {
      toast.error(getErrorMessage(error.code, error.message));
    },
  });

  return {
    placeBet: placeBetMutation.mutate,
    isPlacingBet: placeBetMutation.isPending,
    cashOut: cashOutMutation.mutate,
    isCashingOut: cashOutMutation.isPending,
  };
}
