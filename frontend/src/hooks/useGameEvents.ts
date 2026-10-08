import { useCallback, type RefObject } from "react";
import { BetStatus, type Bet } from "@/types";
import { useGameStore } from "@/store/game-store";
import { useGameSounds } from "@/hooks/useGameSounds";
import { toast } from "sonner";
import { centsToDecimal, formatMoney } from "@/domain/money";
import type { GameEventHandlers } from "@/websocket/games-websocket";

/**
 * Returns a factory that builds WebSocket event handlers bound to the given
 * player. The factory identity changes when `playerId` changes, which makes
 * useGameWebSocket reconnect with fresh handlers.
 */
export function useGameEvents(playerId?: string) {
  const { playCrash } = useGameSounds();

  return useCallback(
    (currentRoundIdRef: RefObject<string | null>): GameEventHandlers => {
      const isOtherRound = (roundId: string) =>
        currentRoundIdRef.current !== null && roundId !== currentRoundIdRef.current;
      const store = () => useGameStore.getState();

      return {
        onRoundStarted: (data) => {
          currentRoundIdRef.current = data.roundId;
          store().setRoundStarted(data.roundId, data.seedHash, new Date(data.bettingEndTime));
        },
        onBettingEnded: (data) => {
          if (data.roundId === currentRoundIdRef.current) store().setBettingEnded();
        },
        onMultiplierUpdate: (data) => {
          if (data.roundId === currentRoundIdRef.current) store().setMultiplier(data.multiplier);
        },
        onCrash: (data) => {
          if (data.roundId !== currentRoundIdRef.current) return;
          store().setCrash(data.crashPoint);
          const myBet = store().myActiveBet;
          if (myBet && myBet.status !== BetStatus.CASHED_OUT) playCrash();
        },
        onBetPlaced: (data) => {
          if (isOtherRound(data.roundId)) return;
          const bet: Bet = {
            id: data.betId,
            roundId: data.roundId,
            playerId: data.playerId,
            playerName: data.playerName ?? "",
            amountCents: data.amountCents,
            amountDecimal: centsToDecimal(data.amountCents),
            status: BetStatus.PENDING,
            cashOutMultiplier: null,
            payoutCents: null,
            payoutDecimal: null,
            cashedOutAt: null,
            autoCashOutMultiplier: null,
          };
          store().addBet(bet);
        },
        onPlayerCashedOut: (data) => {
          if (isOtherRound(data.roundId)) return;
          const payoutDecimal = centsToDecimal(data.payoutCents);
          store().updateBet(data.betId, {
            status: BetStatus.CASHED_OUT,
            cashOutMultiplier: data.multiplier,
            payoutCents: data.payoutCents,
            payoutDecimal,
            cashedOutAt: new Date(),
          });
          if (store().myActiveBet?.id === data.betId) {
            store().updateBetStatus(data.betId, BetStatus.CASHED_OUT, {
              multiplier: data.multiplier,
              payoutCents: data.payoutCents,
              payoutDecimal,
            });
          }
        },
        onBetConfirmed: (data) => {
          if (isOtherRound(data.roundId)) return;
          store().updateBet(data.betId, { status: BetStatus.ACTIVE });
          if (data.playerId !== playerId) return;
          if (store().myActiveBet?.id === data.betId) {
            store().updateBetStatus(data.betId, BetStatus.ACTIVE);
          }
          toast.success("Bet Confirmed!", {
            description: `${formatMoney(data.amountCents)} is now active`,
            duration: 3000,
          });
        },
        onBetCancelled: (data) => {
          if (isOtherRound(data.roundId)) return;
          store().updateBet(data.betId, { status: BetStatus.CANCELLED });
          if (data.playerId !== playerId) return;
          if (store().myActiveBet?.id === data.betId) store().setMyActiveBet(null);
          toast.error("Bet Cancelled", { description: data.reason, duration: 4000 });
        },
      };
    },
    [playCrash, playerId],
  );
}
