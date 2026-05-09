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
import { useGameStore } from '@/infrastructure/store/game-store';
import { RoundStatus } from '@/domain/types/game.types';

function GameContent() {
  const { user } = useAuth();
  const { isConnected, connectionStatus, reconnectAttempt } = useGameWebSocket({ enabled: true });
  const { roundStatus, liveMultiplier } = useGameStore();

  // Map RoundStatus enum to component props
  const roundPhase = roundStatus === RoundStatus.BETTING ? 'betting' :
                     roundStatus === RoundStatus.ACTIVE ? 'active' : 'crashed';

  return (
    <GameLayout>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 p-4">
        {/* Left Column - Crash Graph */}
        <div className="lg:col-span-3 space-y-4">
          <CrashGraph
            multiplier={liveMultiplier}
            phase={roundPhase}
            isConnected={isConnected}
            connectionStatus={connectionStatus}
            reconnectAttempt={reconnectAttempt}
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
