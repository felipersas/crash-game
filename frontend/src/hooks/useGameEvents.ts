import { useCallback } from "react";
import { BetStatus, type Bet } from "@/types/game.types";
import { useGameStore } from "@/store/game-store";
import { useGameSounds } from "@/hooks/useGameSounds";
import { toast } from "sonner";
import { formatMoney } from "@/domain/money";

export function useGameEvents(playerId?: string) {
  const setStoreRoundStarted = useGameStore((s) => s.setRoundStarted);
  const setStoreBettingEnded = useGameStore((s) => s.setBettingEnded);
  const setStoreMultiplier = useGameStore((s) => s.setMultiplier);
  const setStoreCrash = useGameStore((s) => s.setCrash);
  const setStoreCurrentBets = useGameStore((s) => s.setCurrentBets);
  const setStoreMyActiveBet = useGameStore((s) => s.setMyActiveBet);
  const storeAddBet = useGameStore((s) => s.addBet);
  const storeUpdateBet = useGameStore((s) => s.updateBet);
  const { playCrash } = useGameSounds();

  return useCallback((currentRoundIdRef: React.MutableRefObject<string | null>) => ({
    onRoundStarted: (data: { roundId: string; seedHash: string; bettingEndTime: Date | string }) => {
      currentRoundIdRef.current = data.roundId;
      setStoreRoundStarted(data.roundId, data.seedHash, new Date(data.bettingEndTime));
      setStoreCurrentBets([]);
    },
    onBettingEnded: (data: { roundId: string }) => {
      if (data.roundId === currentRoundIdRef.current) setStoreBettingEnded();
    },
    onMultiplierUpdate: (data: { roundId: string; multiplier: number }) => {
      if (data.roundId === currentRoundIdRef.current) setStoreMultiplier(data.multiplier);
    },
    onCrash: (data: { roundId: string; crashPoint: number }) => {
      if (data.roundId === currentRoundIdRef.current) {
        setStoreCrash(data.crashPoint);
        const state = useGameStore.getState();
        if (state.myActiveBet && state.myActiveBet.status !== "CASHED_OUT") playCrash();
      }
    },
    onBetPlaced: (data: { roundId: string; betId: string; playerId: string; playerName: string; amountCents: number }) => {
      if (currentRoundIdRef.current && data.roundId !== currentRoundIdRef.current) return;
      const bet: Bet = {
        id: data.betId, roundId: data.roundId, playerId: data.playerId,
        playerName: data.playerName ?? '', amountCents: data.amountCents,
        amountDecimal: (data.amountCents / 100).toFixed(2), status: BetStatus.PENDING,
        cashOutMultiplier: null, payoutCents: null, payoutDecimal: null, cashedOutAt: null,
      };
      storeAddBet(bet);
    },
    onPlayerCashedOut: (data: { roundId: string; betId: string; multiplier: number; payoutCents: number }) => {
      if (currentRoundIdRef.current && data.roundId !== currentRoundIdRef.current) return;
      storeUpdateBet(data.betId, {
        status: BetStatus.CASHED_OUT, cashOutMultiplier: data.multiplier,
        payoutCents: data.payoutCents, payoutDecimal: (data.payoutCents / 100).toFixed(2),
        cashedOutAt: new Date(),
      });
    },
    onBetConfirmed: (data: { roundId: string; betId: string; playerId: string; amountCents: number }) => {
      if (currentRoundIdRef.current && data.roundId !== currentRoundIdRef.current) return;
      storeUpdateBet(data.betId, { status: BetStatus.ACTIVE });
      if (data.playerId === playerId) {
        const myBet = useGameStore.getState().myActiveBet;
        if (myBet?.id === data.betId) useGameStore.getState().updateBetStatus(data.betId, BetStatus.ACTIVE);
        toast.success("Bet Confirmed!", { description: `${formatMoney(data.amountCents)} is now active`, duration: 3000 });
      }
    },
    onBetCancelled: (data: { roundId: string; betId: string; playerId: string; reason: string }) => {
      if (currentRoundIdRef.current && data.roundId !== currentRoundIdRef.current) return;
      storeUpdateBet(data.betId, { status: BetStatus.CANCELLED });
      if (data.playerId === playerId) {
        const myBet = useGameStore.getState().myActiveBet;
        if (myBet?.id === data.betId) setStoreMyActiveBet(null);
        toast.error("Bet Cancelled", { description: data.reason, duration: 4000 });
      }
    },
  }), [
    setStoreRoundStarted, setStoreBettingEnded, setStoreMultiplier, setStoreCrash,
    setStoreCurrentBets, setStoreMyActiveBet, storeAddBet, storeUpdateBet, playCrash, playerId,
  ]);
}
