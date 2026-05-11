"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useGameStore } from "@/store/game-store";
import { useGameSounds } from "@/hooks/useGameSounds";
import { calculatePayout, formatMoney } from "@/utils/money";
import { RoundStatus } from "@/types/game.types";
import type { Bet } from "@/types/game.types";

export function useBetToast() {
  const myActiveBet = useGameStore((s) => s.myActiveBet);
  const roundStatus = useGameStore((s) => s.roundStatus);
  const liveMultiplier = useGameStore((s) => s.liveMultiplier);
  const { playWin } = useGameSounds();

  const prevRoundStatus = useRef(roundStatus);
  const prevMyActiveBet = useRef(myActiveBet);
  const hasShownWinToast = useRef(false);
  const hasShownLossToast = useRef(false);

  function handleToasts(
    bet: Bet | null,
    status: RoundStatus,
    multiplier: number,
  ) {
    if (
      prevMyActiveBet.current?.status !== "CASHED_OUT" &&
      bet?.status === "CASHED_OUT" &&
      !hasShownWinToast.current
    ) {
      const winAmount = bet.payoutCents
        ? formatMoney(bet.payoutCents)
        : formatMoney(
            calculatePayout(
              bet.amountCents,
              bet.cashOutMultiplier || multiplier,
            ),
          );

      toast.success("Cashed Out!", {
        description: `You won ${winAmount} at ${bet.cashOutMultiplier?.toFixed(2)}x`,
        duration: 4000,
      });
      playWin();
      hasShownWinToast.current = true;
      hasShownLossToast.current = false;
    }

    if (
      prevRoundStatus.current !== RoundStatus.CRASHED &&
      status === RoundStatus.CRASHED &&
      bet &&
      bet.status !== "CASHED_OUT" &&
      !hasShownLossToast.current
    ) {
      toast.error("Crashed!", {
        description: `You lost ${formatMoney(bet.amountCents)} at ${multiplier.toFixed(2)}x`,
        duration: 4000,
      });
      hasShownLossToast.current = true;
      hasShownWinToast.current = false;
    }

    if (
      status === RoundStatus.BETTING &&
      prevRoundStatus.current !== RoundStatus.BETTING
    ) {
      hasShownWinToast.current = false;
      hasShownLossToast.current = false;
    }

    prevRoundStatus.current = status;
    prevMyActiveBet.current = bet;
  }

  useEffect(() => {
    handleToasts(myActiveBet, roundStatus, liveMultiplier);
  }, [roundStatus, myActiveBet, liveMultiplier]);
}
