import { useCallback } from "react";
import { getCurrentRound } from "@/libs/games-api";
import { RoundStatus, type Round } from "@/types/game.types";
import { useGameStore } from "@/store/game-store";

export function useRoundSync(playerId?: string) {
  const setStoreRoundStarted = useGameStore((s) => s.setRoundStarted);
  const setStoreRejoinActiveRound = useGameStore((s) => s.rejoinActiveRound);
  const setStoreCrash = useGameStore((s) => s.setCrash);
  const setStoreCurrentBets = useGameStore((s) => s.setCurrentBets);
  const setStoreMyActiveBet = useGameStore((s) => s.setMyActiveBet);
  const setStoreHydrated = useGameStore((s) => s.setHydrated);

  return useCallback(
    async (currentRoundIdRef: React.MutableRefObject<string | null>) => {
      try {
        const round: Round = await getCurrentRound();
        currentRoundIdRef.current = round.roundId;

        switch (round.status) {
          case RoundStatus.BETTING:
            setStoreRoundStarted(
              round.roundId,
              round.seedHash || "",
              round.bettingEndTime
                ? new Date(round.bettingEndTime)
                : new Date(Date.now() + 10000),
            );
            setStoreCurrentBets(round.bets || []);
            break;
          case RoundStatus.ACTIVE:
            setStoreRejoinActiveRound(
              round.roundId,
              round.seedHash || "",
              round.startedAt ? new Date(round.startedAt) : new Date(),
              round.currentMultiplier ?? 1.0,
              round.bets || [],
            );
            break;
          case RoundStatus.CRASHED:
            setStoreRoundStarted(
              round.roundId,
              round.seedHash || "",
              new Date(),
              round.startedAt ? new Date(round.startedAt) : null,
            );
            setStoreCrash(round.crashPoint ?? 1.0);
            setStoreCurrentBets(round.bets || []);
            break;
        }

        if (playerId && round.bets?.length) {
          const myBet = round.bets.find(
            (b) =>
              b.playerId === playerId &&
              b.status !== "LOST" &&
              b.status !== "CANCELLED",
          );
          if (myBet) setStoreMyActiveBet(myBet);
        }
      } catch (error) {
        console.error("Failed to sync current round:", error);
      } finally {
        setStoreHydrated();
      }
    },
    [
      setStoreRoundStarted,
      setStoreRejoinActiveRound,
      setStoreCrash,
      setStoreCurrentBets,
      setStoreMyActiveBet,
      setStoreHydrated,
      playerId,
    ],
  );
}
