"use client";

import { useGame } from "@/hooks/useGame";
import { formatMoney } from "@/shared/utils/money";

export default function BetsList() {
  const { currentRound } = useGame();
  const bets = currentRound?.bets || [];

  return (
    <div className="bg-zinc-900/50 border border-purple-500/20 rounded-xl p-4">
      <h3 className="text-lg font-semibold mb-3">Current Round Bets</h3>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {!bets?.length ? (
          <p className="text-zinc-500 text-center py-4">No bets yet</p>
        ) : (
          bets.map((bet) => (
            <div
              key={bet.id}
              className="flex items-center justify-between py-2 px-3 bg-zinc-800/50 rounded-lg"
            >
              <span className="text-zinc-400">
                {bet.playerId.slice(0, 8)}...
              </span>
              <div className="text-right">
                <p className="font-semibold">{formatMoney(bet.amountCents)}</p>
                {bet.status === "CASHED_OUT" && (
                  <p className="text-xs text-green-400">
                    @{bet.cashOutMultiplier?.toFixed(2)}x →{" "}
                    {formatMoney(bet.cashOutAmountCents || 0)}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
