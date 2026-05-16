"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useGame } from "@/hooks/useGame";
import { useWallet } from "@/hooks/useWallet";
import { useGameStore } from "@/store/game-store";
import { RoundStatus } from "@/types";
import { BetInput } from "./BetInput";
import { BetStatusDisplay, CashOutButton } from "./BetStatusDisplay";
import { useBetToast } from "./useBetToast";
import { useGameSounds } from "@/hooks/useGameSounds";
import { toast } from "sonner";
import { betFormSchema, type BetFormValues } from "@/schemas/bet-form.schema";
import { AutoCashOut } from "./AutoCashOut";

export default function BetControls() {
  const { placeBet, isPlacingBet, cashOut, isCashingOut } = useGame();
  const { balance } = useWallet();
  const myActiveBet = useGameStore((s) => s.myActiveBet);
  const roundStatus = useGameStore((s) => s.roundStatus);
  const liveMultiplier = useGameStore((s) => s.liveMultiplier);
  const { data: session, status: authStatus } = useSession();

  const { control, handleSubmit, formState: { errors } } = useForm<BetFormValues>({
    resolver: zodResolver(betFormSchema),
    defaultValues: { amountCents: 1000, targetMultiplier: undefined },
  });

  useBetToast();
  const { playBet } = useGameSounds();

  const isAuthenticated = authStatus === "authenticated";
  const isBettingPhase = roundStatus === RoundStatus.BETTING;
  const isActivePhase = roundStatus === RoundStatus.ACTIVE;
  const isCrashed = roundStatus === RoundStatus.CRASHED;

  const canBet = isBettingPhase && !myActiveBet && isAuthenticated;
  const isBetActive = myActiveBet?.status === "ACTIVE";
  const canCashOut = isActivePhase && isBetActive;
  const showCashOut = isBetActive && !isCrashed;

  const onSubmit = (data: BetFormValues) => {
    const balanceCents = Math.round(parseFloat(balance) * 100);
    if (data.amountCents > balanceCents) {
      toast.error("Insufficient balance");
      return;
    }
    playBet();
    placeBet({
      amountCents: data.amountCents,
      autoCashOutAt: data.targetMultiplier,
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="panel-cyber rounded-lg p-6 space-y-4 h-full flex flex-col">
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

      <BetInput control={control} disabled={!canBet} error={errors.amountCents?.message} />

      {isAuthenticated && (
        <AutoCashOut control={control} disabled={!canBet} roundStatus={roundStatus} />
      )}

      {canBet && (
        <button
          type="submit"
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

      {showCashOut && myActiveBet && (
        <CashOutButton
          myActiveBet={myActiveBet}
          liveMultiplier={liveMultiplier}
          onCashOut={() => cashOut()}
          isCashingOut={isCashingOut}
          disabled={!canCashOut}
        />
      )}

      <BetStatusDisplay
        myActiveBet={myActiveBet}
        isCrashed={isCrashed}
        isActivePhase={isActivePhase}
        liveMultiplier={liveMultiplier}
      />
    </form>
  );
}
