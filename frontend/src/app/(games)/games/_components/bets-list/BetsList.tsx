"use client";

import { useMemo, memo } from "react";
import { useGameStore } from "@/store/game-store";
import { formatMoney } from "@/domain/money";
import { Users } from "lucide-react";
import { BetStatus, type Bet } from "@/types";

const MAX_VISIBLE_BETS = 15;

function BetsList() {
  const currentBets = useGameStore((s) => s.currentBets);

  // Filter out cancelled bets, show newest first, limit to MAX_VISIBLE_BETS
  const visibleBets = useMemo<Bet[]>(
    () =>
      currentBets
        .filter((bet) => bet.status !== BetStatus.CANCELLED)
        .slice(-MAX_VISIBLE_BETS)
        .reverse(),
    [currentBets],
  );

  return (
    <div className="panel-cyber rounded-lg p-5 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-end mb-4">
        <div className="flex items-center gap-1.5 text-text-muted">
          <Users className="w-4 h-4" />
          <span className="text-sm font-terminal">{visibleBets.length}</span>
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-3 gap-2 px-3 py-2 bg-surface/50 border-b border-border text-xs font-terminal text-text-muted uppercase tracking-wider">
        <span>Player</span>
        <span className="text-center">Bet</span>
        <span className="text-right">Payout</span>
      </div>

      {/* Bets List */}
      <div className="space-y-1 flex-1 overflow-y-auto mt-2">
        {!visibleBets.length ? (
          <div className="text-center py-8">
            <p className="text-text-muted font-terminal text-sm">
              No active bets
            </p>
            <p className="text-text-muted/50 font-terminal text-xs mt-1">
              Waiting for players...
            </p>
          </div>
        ) : (
          visibleBets.map((bet) => (
            <div
              key={bet.id}
              className="grid grid-cols-3 gap-2 px-3 py-2 bg-surface/30 hover:bg-surface/50 border-l-2 border-transparent hover:border-primary transition-colors rounded items-center animate-bet-slide-in"
            >
              {/* Player Name - Truncated */}
              <span
                className="font-terminal text-sm text-text-primary truncate"
                title={bet.playerName || bet.playerId}
              >
                {bet.playerName || bet.playerId.slice(0, 8)}
              </span>

              {/* Bet Amount */}
              <span className="font-terminal text-sm text-text-primary text-center">
                {formatMoney(bet.amountCents)}
              </span>

              {/* Payout Multiplier */}
              {bet.status === BetStatus.CASHED_OUT && bet.cashOutMultiplier ? (
                <span className="font-terminal text-sm text-primary text-right">
                  @{bet.cashOutMultiplier.toFixed(2)}x
                </span>
              ) : bet.status === BetStatus.ACTIVE ? (
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
      {visibleBets.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="flex justify-between text-xs font-terminal text-text-muted">
            <span>Total Bets:</span>
            <span className="text-text-primary">{visibleBets.length}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(BetsList);