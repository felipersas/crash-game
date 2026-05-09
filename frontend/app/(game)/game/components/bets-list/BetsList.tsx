"use client";

import { useGameStore } from "@/infrastructure/store/game-store";
import { formatMoney } from "@/shared/utils/money";
import { Users, Activity } from "lucide-react";

export default function BetsList() {
  const { currentBets } = useGameStore();

  return (
    <div className="panel-cyber rounded-lg p-5">
      {/* Header - "THE PULSE" */}
      <div className="flex items-center justify-end mb-4">
        <div className="flex items-center gap-1.5 text-text-muted">
          <Users className="w-4 h-4" />
          <span className="text-sm font-terminal">
            {currentBets?.length || 0}
          </span>
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-3 gap-2 px-3 py-2 bg-surface/50 border-b border-border text-xs font-terminal text-text-muted uppercase tracking-wider">
        <span>Player</span>
        <span className="text-center">Bet</span>
        <span className="text-right">Payout</span>
      </div>

      {/* Bets List */}
      <div className="space-y-1 min-h-64 overflow-y-auto mt-2">
        {!currentBets?.length ? (
          <div className="text-center py-8">
            <p className="text-text-muted font-terminal text-sm">
              No active bets
            </p>
            <p className="text-text-muted/50 font-terminal text-xs mt-1">
              Waiting for players...
            </p>
          </div>
        ) : (
          currentBets.map((bet) => (
            <div
              key={bet.id}
              className="grid grid-cols-3 gap-2 px-3 py-2 bg-surface/30 hover:bg-surface/50 border-l-2 border-transparent hover:border-primary transition-all rounded items-center"
            >
              {/* Player Name - Truncated */}
              <span
                className="font-terminal text-sm text-text-primary truncate"
                title={bet.playerId}
              >
                {bet.playerId.slice(0, 8)}...
              </span>

              {/* Bet Amount */}
              <span className="font-terminal text-sm text-text-primary text-center">
                {formatMoney(bet.amountCents)}
              </span>

              {/* Payout Multiplier */}
              {bet.status === "CASHED_OUT" && bet.cashOutMultiplier ? (
                <span className="font-terminal text-sm text-primary text-right">
                  @{bet.cashOutMultiplier.toFixed(2)}x
                </span>
              ) : bet.status === "ACTIVE" ? (
                <span className="font-terminal text-sm text-warning text-right">
                  Playing
                </span>
              ) : (
                <span className="font-terminal text-sm text-text-muted text-right">
                  —
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer Stats */}
      {currentBets && currentBets.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="flex justify-between text-xs font-terminal text-text-muted">
            <span>Total Bets:</span>
            <span className="text-text-primary">{currentBets.length}</span>
          </div>
        </div>
      )}
    </div>
  );
}
