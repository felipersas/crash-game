"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useGame } from "@/hooks/useGame";
import { useGameStore } from "@/infrastructure/store/game-store";
import { useGameSounds } from "@/hooks/useGameSounds";
import { Input } from "@/components/ui/input";
import { calculatePayout, formatMoney } from "@/shared/utils/money";
import { RoundStatus } from "@/domain/types/game.types";

export default function BetControls() {
  const { placeBet, isPlacingBet, cashOut, isCashingOut } = useGame();
  const { myActiveBet, roundStatus, liveMultiplier } = useGameStore();
  const { playWin, playCrash } = useGameSounds();

  const [amount, setAmount] = useState("10.00");
  const [autoCashOut, setAutoCashOut] = useState("2.00");
  const [activeTab, setActiveTab] = useState<"manual" | "auto">("manual");

  // Track previous state for toast notifications
  const prevRoundStatus = useRef(roundStatus);
  const prevMyActiveBet = useRef(myActiveBet);
  const hasShownWinToast = useRef(false);
  const hasShownLossToast = useRef(false);

  // Derive phase states from roundStatus enum
  const isBettingPhase = roundStatus === RoundStatus.BETTING;
  const isActivePhase = roundStatus === RoundStatus.ACTIVE;
  const isCrashed = roundStatus === RoundStatus.CRASHED;

  const canBet = isBettingPhase && !myActiveBet;
  const canCashOut = isActivePhase && myActiveBet;

  // Win/Loss toast notifications
  useEffect(() => {
    // Check for cash out (win)
    if (
      prevMyActiveBet.current?.status !== "CASHED_OUT" &&
      myActiveBet?.status === "CASHED_OUT" &&
      !hasShownWinToast.current
    ) {
      const winAmount = myActiveBet.cashOutAmountCents
        ? formatMoney(myActiveBet.cashOutAmountCents)
        : formatMoney(
            calculatePayout(
              myActiveBet.amountCents,
              myActiveBet.cashOutMultiplier || liveMultiplier,
            ),
          );

      toast.success("Cashed Out!", {
        description: `You won ${winAmount} at ${myActiveBet.cashOutMultiplier?.toFixed(2)}x`,
        duration: 4000,
      });
      playWin();
      hasShownWinToast.current = true;
      hasShownLossToast.current = false;
    }

    // Check for crash (loss)
    if (
      prevRoundStatus.current !== RoundStatus.CRASHED &&
      roundStatus === RoundStatus.CRASHED &&
      myActiveBet &&
      myActiveBet.status !== "CASHED_OUT" &&
      !hasShownLossToast.current
    ) {
      toast.error("Crashed!", {
        description: `You lost ${formatMoney(myActiveBet.amountCents)} at ${liveMultiplier.toFixed(2)}x`,
        duration: 4000,
      });
      playCrash();
      hasShownLossToast.current = true;
      hasShownWinToast.current = false;
    }

    // Reset toasts when new betting starts
    if (
      roundStatus === RoundStatus.BETTING &&
      prevRoundStatus.current !== RoundStatus.BETTING
    ) {
      hasShownWinToast.current = false;
      hasShownLossToast.current = false;
    }

    prevRoundStatus.current = roundStatus;
    prevMyActiveBet.current = myActiveBet;
  }, [roundStatus, myActiveBet, liveMultiplier]);

  const handlePlaceBet = () => {
    const cents = Math.round(parseFloat(amount) * 100);
    placeBet(cents);
    toast.success("Bet Placed", {
      description: `Betting ${formatMoney(cents)} on this round`,
      duration: 2000,
    });
  };

  const potentialWin = myActiveBet
    ? calculatePayout(myActiveBet.amountCents, liveMultiplier)
    : null;

  const handleHalfBet = () => {
    const current = parseFloat(amount) || 0;
    setAmount(Math.max(1, current / 2).toFixed(2));
  };

  const handleDoubleBet = () => {
    const current = parseFloat(amount) || 0;
    setAmount(Math.min(1000, current * 2).toFixed(2));
  };

  const handleMaxBet = () => {
    setAmount("1000.00");
  };

  return (
    <div className="panel-cyber rounded-lg p-6 space-y-6 h-80 md:h-82">
      {/* Tabs */}
      <div className="flex gap-1 bg-primary p-1 rounded">
        <button
          onClick={() => {
            setActiveTab("manual");
          }}
          className={`flex-1 py-2 px-4 text-sm font-bold uppercase tracking-wider rounded transition-all ${
            activeTab === "manual"
              ? "bg-primary text-black shadow-lg shadow-primary/20"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          Manual
        </button>
      </div>

      {/* Amount Input */}
      <div className="space-y-2">
        <label className="text-xs font-terminal text-text-muted uppercase tracking-wider">
          Bet Amount
        </label>
        <div className="relative">
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            step="0.01"
            min="1"
            max="1000"
            className="input-cyber pr-12 text-lg font-bold"
            disabled={!canBet}
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted font-terminal text-sm">
            USD
          </span>
        </div>

        {/* Quick Actions */}
        {canBet && (
          <div className="flex gap-2">
            <button
              onClick={handleHalfBet}
              className="flex-1 py-2 text-xs font-terminal text-text-muted border border-border hover:border-primary hover:text-primary transition-colors rounded"
            >
              1/2
            </button>
            <button
              onClick={handleDoubleBet}
              className="flex-1 py-2 text-xs font-terminal text-text-muted border border-border hover:border-primary hover:text-primary transition-colors rounded"
            >
              2x
            </button>
            <button
              onClick={handleMaxBet}
              className="flex-1 py-2 text-xs font-terminal text-text-muted border border-border hover:border-primary hover:text-primary transition-colors rounded"
            >
              MAX
            </button>
          </div>
        )}
      </div>

      {/* Auto Cash Out */}
      {activeTab === "auto" && (
        <div className="space-y-2">
          <label className="text-xs font-terminal text-text-muted uppercase tracking-wider">
            Auto Cash Out
          </label>
          <div className="relative">
            <Input
              value={autoCashOut}
              onChange={(e) => setAutoCashOut(e.target.value)}
              type="number"
              step="0.01"
              min="1.01"
              max="1000"
              className="input-cyber pr-8"
              disabled={!canBet}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted font-terminal text-sm">
              x
            </span>
          </div>
        </div>
      )}

      {/* Main CTA Button */}
      {canBet && (
        <button
          onClick={handlePlaceBet}
          disabled={isPlacingBet}
          className="w-full btn-cyber-primary py-4 rounded-2xl text-lg font-black uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPlacingBet ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              Processing
            </span>
          ) : (
            "BET"
          )}
        </button>
      )}

      {canCashOut && (
        <div className="space-y-3">
          <div className="flex justify-between text-sm font-terminal">
            <span className="text-text-muted">Bet:</span>
            <span className="text-text-primary">
              {formatMoney(myActiveBet.amountCents)}
            </span>
          </div>
          <div className="flex justify-between text-sm font-terminal">
            <span className="text-text-muted">Potential:</span>
            <span className="text-primary">
              {formatMoney(potentialWin || 0)}
            </span>
          </div>
          <button
            onClick={() => {
              cashOut();
            }}
            disabled={isCashingOut}
            className="w-full btn-cyber-primary py-4 text-lg font-black uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed animate-pulse-glow"
          >
            {isCashingOut ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                Cashing Out...
              </span>
            ) : (
              `CASH OUT @ ${liveMultiplier.toFixed(2)}x`
            )}
          </button>
        </div>
      )}

      {isCrashed && myActiveBet && myActiveBet.status !== "CASHED_OUT" && (
        <div className="text-center py-4">
          <p className="text-error font-terminal text-sm uppercase tracking-wider">
            Crashed at {liveMultiplier.toFixed(2)}x
          </p>
          <p className="text-text-muted font-terminal text-xs mt-1">
            You lost {formatMoney(myActiveBet.amountCents)}
          </p>
        </div>
      )}

      {isCrashed && myActiveBet?.status === "CASHED_OUT" && (
        <div className="text-center py-4">
          <p className="text-primary font-terminal text-sm uppercase tracking-wider">
            You Won!
          </p>
          <p className="text-text-primary font-terminal text-lg mt-1">
            {formatMoney(myActiveBet.cashOutAmountCents || 0)}
          </p>
          <p className="text-text-muted font-terminal text-xs mt-1">
            at {myActiveBet.cashOutMultiplier?.toFixed(2)}x
          </p>
        </div>
      )}

      {isCrashed && !myActiveBet && (
        <div className="text-center py-4">
          <p className="text-text-muted font-terminal text-sm">
            Next round starting soon...
          </p>
        </div>
      )}
    </div>
  );
}
