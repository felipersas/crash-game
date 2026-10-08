import { useCallback, type RefObject } from "react";
import { getCurrentRound } from "@/libs/games-api";
import { BetStatus, RoundStatus } from "@/types";
import { useGameStore } from "@/store/game-store";
import { GAME_CONSTANTS } from "@/constants/game";

/**
 * Returns a function that syncs the current round (and my bet in it) from
 * REST into the store. Called on every (re)connect.
 */
export function useRoundSync(playerId?: string) {
  return useCallback(
    async (currentRoundIdRef: RefObject<string | null>) => {
      const store = useGameStore.getState();
      try {
        const round = await getCurrentRound();
        currentRoundIdRef.current = round.roundId;
        const bets = round.bets ?? [];

        switch (round.status) {
          case RoundStatus.BETTING:
            store.setRoundStarted(
              round.roundId,
              round.seedHash ?? "",
              round.bettingEndTime
                ? new Date(round.bettingEndTime)
                : new Date(Date.now() + GAME_CONSTANTS.BETTING_DURATION_MS),
            );
            store.setCurrentBets(bets);
            break;
          case RoundStatus.ACTIVE:
            store.rejoinActiveRound(
              round.roundId,
              round.seedHash ?? "",
              round.startedAt ? new Date(round.startedAt) : new Date(),
              round.currentMultiplier ?? 1.0,
              bets,
            );
            break;
          case RoundStatus.CRASHED:
            store.setRoundStarted(
              round.roundId,
              round.seedHash ?? "",
              new Date(),
              round.startedAt ? new Date(round.startedAt) : null,
            );
            store.setCrash(round.crashPoint ?? 1.0);
            store.setCurrentBets(bets);
            break;
        }

        if (playerId) {
          const myBet = bets.find(
            (b) =>
              b.playerId === playerId &&
              b.status !== BetStatus.LOST &&
              b.status !== BetStatus.CANCELLED,
          );
          if (myBet) store.setMyActiveBet(myBet);
        }
      } catch (error) {
        console.error("Failed to sync current round:", error);
      } finally {
        store.setHydrated();
      }
    },
    [playerId],
  );
}
