'use client';

/**
 * Game Page - Main game interface
 */

import { Providers } from '@/lib/providers';
import GameLayout from './components/game-layout/GameLayout';
import PlayerInfo from './components/player-info/PlayerInfo';
import CrashGraph from './components/crash-graph/CrashGraph';
import BetControls from './components/bet-controls/BetControls';
import BetsList from './components/bets-list/BetsList';
import RoundHistory from './components/round-history/RoundHistory';
import { useGameWebSocket } from '@/hooks/useGameWebSocket';
import { useAuth } from '@/hooks/useAuth';

function GameContent() {
  const { user } = useAuth();
  const { isConnected, roundPhase, liveMultiplier, currentRoundId } = useGameWebSocket({ enabled: true });

  return (
    <GameLayout>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 p-4">
        {/* Left Column - Crash Graph */}
        <div className="lg:col-span-3 space-y-4">
          <CrashGraph 
            multiplier={liveMultiplier}
            phase={roundPhase}
            isConnected={isConnected}
          />
          <BetControls />
          <BetsList />
        </div>

        {/* Right Column - Info & History */}
        <div className="space-y-4">
          <PlayerInfo username={user?.username || ''} />
          <RoundHistory />
        </div>
      </div>
    </GameLayout>
  );
}

export default function GamePage() {
  return (
    <Providers>
      <GameContent />
    </Providers>
  );
}
