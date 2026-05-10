"use client";

import CrashGraph from "./components/crash-graph/CrashGraph";
import BetControls from "./components/bet-controls/BetControls";
import BetsList from "./components/bets-list/BetsList";
import RoundHistory from "./components/round-history/RoundHistory";
import { useGameStore } from "@/store/game-store";
import { RoundStatus } from "@/types/game.types";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useRoundHistory } from "@/hooks/useRoundHistory";
import { useSession } from "next-auth/react";

export default function GameContent() {
  const roundStatus = useGameStore((s) => s.roundStatus);
  const liveMultiplier = useGameStore((s) => s.liveMultiplier);
  const { data: session } = useSession();

  useGameWebSocket({
    token: session?.accessToken,
    playerId: session?.playerId,
    enabled: true,
  });

  const { data: historyData } = useRoundHistory({ page: 1, limit: 10 });

  const roundPhase =
    roundStatus === RoundStatus.BETTING
      ? "betting"
      : roundStatus === RoundStatus.ACTIVE
        ? "active"
        : "crashed";

  return (
    <div className="container mx-auto min-h-screen px-4 pb-4">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
        {/* Center - Crash Graph (first on mobile) */}
        <div className="md:col-span-6 md:order-2">
          <CrashGraph multiplier={liveMultiplier} phase={roundPhase} recentRounds={historyData?.data} />
        </div>

        {/* Left Panel - Bet Controls (second on mobile) */}
        <div className="md:col-span-3 md:order-1">
          <BetControls />
        </div>

        {/* Right Panel - Active Bets (third on mobile) */}
        <div className="md:col-span-3 md:order-3">
          <BetsList />
        </div>

        {/* Footer - Round History (last) */}
        <div className="md:col-span-12 md:order-4">
          <RoundHistory />
        </div>
      </div>
    </div>
  );
}
