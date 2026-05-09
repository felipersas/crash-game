"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useGame } from "@/hooks/useGame";
import { useGameStore } from "@/store/game-store";
import { useGameSounds } from "@/hooks/useGameSounds";
import { Input } from "@/components/ui/input";
import { calculatePayout, formatMoney } from "@/shared/utils/money";
import { RoundStatus } from "@/types/game.types";
import { BetButton } from "./BetButton";

export default function BetControls() {
  const { placeBet, isPlacingBet, cashOut, isCashingOut } = useGame();
  const { myActiveBet, roundStatus, liveMultiplier } = useGameStore();
  const { playWin, playCrash } = useGameSounds();
  const { data: session, status: authStatus } = useSession();

  const isAuthenticated = authStatus === "authenticated";

  const [amount, setAmount] = useState("10.00");
  const [autoCashOut, setAutoCashOut] = useState("2.00");

  const prevRoundStatus = useRef(roundStatus);
  const prevMyActiveBet = useRef(myActiveBet);
  const hasShownWinToast = useRef(false);
  const hasShownLossToast = useRef(false);

  const isBettingPhase = roundStatus === RoundStatus.BETTING;
  const isActivePhase = roundStatus === RoundStatus.ACTIVE;
  const isCrashed = roundStatus === RoundStatus.CRASHED;

  const hasCashedOut = myActiveBet?.status === "CASHED_OUT";
  const canBet = isBettingPhase && !myActiveBet && isAuthenticated;
  const canCashOut = isActivePhase && myActiveBet && !hasCashedOut;

  useEffect(() => {
    if (
      prevMyActiveBet.current?.status !== "CASHED_OUT" &&
      myActiveBet?.status === "CASHED_OUT" &&
      !hasShownWinToast.current
    ) {
      const winAmount = myActiveBet.payoutCents
        ? formatMoney(myActiveBet.payoutCents)
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
    <div className="panel-cyber rounded-lg p-6 space-y-4">
      {/* Username display */}
      {isAuthenticated && (
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-xs font-terminal text-primary">
              {(session?.user?.username || session?.playerId || "P")
                .charAt(0)
                .toUpperCase()}
            </span>
          </div>
          <span className="text-sm font-terminal text-text-primary truncate">
            {session?.user?.username || session?.playerId?.slice(0, 8)}
          </span>
        </div>
      )}

      {/* Unauthenticated banner */}
      {!isAuthenticated && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-center">
          <p className="text-sm font-terminal text-warning mb-2">
            Log in to place bets
          </p>
          <Link
            href="/login"
            className="btn-cyber-primary px-4 py-1.5 rounded-lg text-xs font-terminal inline-block"
          >
            Login
          </Link>
        </div>
      )}

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

        {canBet && (
          <div className="flex gap-2">
            <BetButton onAction={handleHalfBet}>1/2</BetButton>
            <BetButton onAction={handleDoubleBet}>2x</BetButton>
            <BetButton onAction={handleMaxBet}>MAX</BetButton>
          </div>
        )}
      </div>

      {/* Auto Cash Out - always visible */}
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
            onClick={() => cashOut()}
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

      {isActivePhase && hasCashedOut && (
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

      {isCrashed && hasCashedOut && (
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
