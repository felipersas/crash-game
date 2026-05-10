"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useGame } from "@/hooks/useGame";
import { useGameStore } from "@/store/game-store";
import { RoundStatus } from "@/types/game.types";
import { BetInput } from "./BetInput";
import { AutoCashoutInput } from "./AutoCashoutInput";
import { BetStatusDisplay, CashOutButton } from "./BetStatusDisplay";
import { useBetToast } from "./useBetToast";

export default function BetControls() {
  const { placeBet, isPlacingBet, cashOut, isCashingOut } = useGame();
  const myActiveBet = useGameStore((s) => s.myActiveBet);
  const roundStatus = useGameStore((s) => s.roundStatus);
  const liveMultiplier = useGameStore((s) => s.liveMultiplier);
  const { data: session, status: authStatus } = useSession();

  useBetToast();

  const isAuthenticated = authStatus === "authenticated";
  const [amount, setAmount] = useState("10.00");
  const [autoCashOut, setAutoCashOut] = useState("2.00");

  const isBettingPhase = roundStatus === RoundStatus.BETTING;
  const isActivePhase = roundStatus === RoundStatus.ACTIVE;
  const isCrashed = roundStatus === RoundStatus.CRASHED;

  const hasCashedOut = myActiveBet?.status === "CASHED_OUT";
  const canBet = isBettingPhase && !myActiveBet && isAuthenticated;
  const canCashOut = isActivePhase && myActiveBet && !hasCashedOut;

  const handlePlaceBet = () => {
    const cents = Math.round(parseFloat(amount) * 100);
    if (isNaN(cents) || cents <= 0) return;
    placeBet(cents);
  };

  return (
    <div className="panel-cyber rounded-lg p-6 space-y-4 h-full flex flex-col">
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

      <BetInput amount={amount} onAmountChange={setAmount} disabled={!canBet} />

      <AutoCashoutInput value={autoCashOut} onChange={setAutoCashOut} disabled={!canBet} />

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

      {canCashOut && myActiveBet && (
        <CashOutButton
          myActiveBet={myActiveBet}
          liveMultiplier={liveMultiplier}
          onCashOut={() => cashOut()}
          isCashingOut={isCashingOut}
        />
      )}

      <BetStatusDisplay
        myActiveBet={myActiveBet}
        isCrashed={isCrashed}
        isActivePhase={isActivePhase}
        liveMultiplier={liveMultiplier}
      />
    </div>
  );
}
