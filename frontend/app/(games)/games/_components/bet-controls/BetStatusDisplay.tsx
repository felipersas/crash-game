"use client";

import { formatMoney, calculatePayout } from "@/shared/utils/money";
import type { Bet } from "@/types/game.types";

interface BetStatusDisplayProps {
  myActiveBet: Bet | null;
  isCrashed: boolean;
  isActivePhase: boolean;
  liveMultiplier: number;
}

export function BetStatusDisplay({
  myActiveBet,
  isCrashed,
  isActivePhase,
  liveMultiplier,
}: BetStatusDisplayProps) {
  const hasCashedOut = myActiveBet?.status === "CASHED_OUT";

  if (myActiveBet?.status === "PENDING") {
    return (
      <div className="text-center py-4">
        <span className="flex items-center justify-center gap-2">
          <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-text-muted font-terminal text-sm uppercase tracking-wider">
            Confirming bet...
          </span>
        </span>
        <p className="text-text-muted font-terminal text-xs mt-2">
          {formatMoney(myActiveBet.amountCents)} pending
        </p>
      </div>
    );
  }

  if (hasCashedOut && (isActivePhase || isCrashed)) {
    return (
      <div className="text-center py-4">
        <p className="text-primary font-terminal text-sm uppercase tracking-wider">
          You Won!
        </p>
        <p className="text-text-primary font-terminal text-lg mt-1">
          {formatMoney(myActiveBet!.payoutCents || 0)}
        </p>
        <p className="text-text-muted font-terminal text-xs mt-1">
          at {myActiveBet!.cashOutMultiplier?.toFixed(2)}x
        </p>
      </div>
    );
  }

  if (isCrashed && myActiveBet && myActiveBet.status !== "CASHED_OUT") {
    return (
      <div className="text-center py-4">
        <p className="text-error font-terminal text-sm uppercase tracking-wider">
          Crashed at {liveMultiplier.toFixed(2)}x
        </p>
        <p className="text-text-muted font-terminal text-xs mt-1">
          You lost {formatMoney(myActiveBet.amountCents)}
        </p>
      </div>
    );
  }

  if (isCrashed && !myActiveBet) {
    return (
      <div className="text-center py-4">
        <p className="text-text-muted font-terminal text-sm">
          Next round starting soon...
        </p>
      </div>
    );
  }

  return null;
}

export function CashOutButton({
  myActiveBet,
  liveMultiplier,
  onCashOut,
  isCashingOut,
  disabled,
}: {
  myActiveBet: Bet;
  liveMultiplier: number;
  onCashOut: () => void;
  isCashingOut: boolean;
  disabled?: boolean;
}) {
  const potentialWin = calculatePayout(myActiveBet.amountCents, liveMultiplier);

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-sm font-terminal">
        <span className="text-text-muted">Bet:</span>
        <span className="text-text-primary">
          {formatMoney(myActiveBet.amountCents)}
        </span>
      </div>
      <div className="flex justify-between text-sm font-terminal">
        <span className="text-text-muted">Potential:</span>
        <span className="text-primary">{formatMoney(potentialWin)}</span>
      </div>
      <button
        onClick={onCashOut}
        disabled={isCashingOut || disabled}
        className={`w-full btn-cyber-primary py-4 text-lg font-black uppercase tracking-widest rounded-xl disabled:opacity-50 disabled:cursor-not-allowed ${!disabled ? "glow-cashout" : ""}`}
      >
        {isCashingOut ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            Cashing Out...
          </span>
        ) : disabled ? (
          "WAITING FOR ROUND..."
        ) : (
          `CASH OUT @ ${liveMultiplier.toFixed(2)}x`
        )}
      </button>
    </div>
  );
}
