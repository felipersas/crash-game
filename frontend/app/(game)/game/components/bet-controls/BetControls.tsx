"use client";

import { useGame } from "@/hooks/useGame";
import { useBetForm } from "@/hooks/useBetForm";
import { useGameStore } from "@/infrastructure/store/game-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  calculatePayout,
  formatMoney,
  formatPayout,
} from "@/shared/utils/money";

export default function BetControls() {
  const { form, potentialPayout } = useBetForm();
  const {
    isBettingPhase,
    isActivePhase,
    isCrashed,
    placeBet,
    isPlacingBet,
    cashOut,
    isCashingOut,
    currentMultiplier,
  } = useGame();
  const { myActiveBet } = useGameStore();

  const canBet = isBettingPhase && !myActiveBet;
  const canCashOut = isActivePhase && myActiveBet;

  const handlePlaceBet = () => {
    const amount = form.getValues("amount");
    if (!amount) return;
    const cents = Math.round(parseFloat(amount) * 100);
    placeBet(cents);
  };

  const potentialWin = myActiveBet
    ? calculatePayout(myActiveBet.amountCents, currentMultiplier)
    : null;

  return (
    <div className="bg-zinc-900/50 border border-purple-500/20 rounded-xl p-4 space-y-4">
      <div>
        <label className="text-sm text-zinc-400">Bet Amount ($)</label>
        <Input
          {...form.register("amount")}
          type="number"
          step="0.01"
          min="1"
          max="1000"
          placeholder="10.00"
          className="bg-zinc-800 border-zinc-700 text-white"
          disabled={!canBet}
        />
      </div>

      {canBet && (
        <Button
          onClick={handlePlaceBet}
          disabled={isPlacingBet}
          className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
        >
          {isPlacingBet ? "Placing..." : "Place Bet"}
        </Button>
      )}

      {canCashOut && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">
              Bet: {formatMoney(myActiveBet.amountCents)}
            </span>
            <span className="text-green-400">
              Win: {formatMoney(potentialWin || 0)}
            </span>
          </div>
          <Button
            onClick={() => cashOut()}
            disabled={isCashingOut}
            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
          >
            {isCashingOut
              ? "Cashing Out..."
              : `Cash Out @ ${currentMultiplier.toFixed(2)}x`}
          </Button>
        </div>
      )}

      {isCrashed && myActiveBet && (
        <div className="text-center text-red-400">
          <p>Round Crashed at {currentMultiplier.toFixed(2)}x</p>
        </div>
      )}
    </div>
  );
}
