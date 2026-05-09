"use client";

/**
 * Game Page - Main game interface
 */

import GameLayout from "./components/game-layout/GameLayout";
import CrashGraph from "./components/crash-graph/CrashGraph";
import BetControls from "./components/bet-controls/BetControls";
import BetsList from "./components/bets-list/BetsList";
import RoundHistory from "./components/round-history/RoundHistory";
import { useGameStore } from "@/infrastructure/store/game-store";
import { RoundStatus } from "@/domain/types/game.types";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useSession } from "next-auth/react";

export default function GameContent() {
  const { roundStatus, liveMultiplier } = useGameStore();
  const { data: session } = useSession();

  // Establish WebSocket connection only after session is loaded
  useGameWebSocket({
    token: session?.accessToken,
    playerId: session?.playerId,
    enabled: !!session?.accessToken,
  });

  // Map RoundStatus enum to component props
  const roundPhase =
    roundStatus === RoundStatus.BETTING
      ? "betting"
      : roundStatus === RoundStatus.ACTIVE
        ? "active"
        : "crashed";

  return (
    <div className="container mx-auto min-h-screen px-4 pb-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Panel - Bet Controls (top) + History (bottom) */}
        <div className="lg:col-span-4 space-y-4">
          <BetControls />
          <RoundHistory />
        </div>

        {/* Right Panel - Crash Graph (top) + Active Bets (bottom) */}
        <div className="lg:col-span-8 space-y-4">
          <CrashGraph multiplier={liveMultiplier} phase={roundPhase} />
          <BetsList />
        </div>
      </div>
    </div>
  );
}
