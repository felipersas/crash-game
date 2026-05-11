"use client";

import { Input } from "@/components/ui/input";
import { BetButton } from "./BetButton";
import { GAME_CONSTANTS } from "@/shared/constants/game.constants";

interface BetInputProps {
  amount: string;
  onAmountChange: (value: string) => void;
  disabled: boolean;
}

export function BetInput({ amount, onAmountChange, disabled }: BetInputProps) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-terminal text-text-muted uppercase tracking-wider">
        Bet Amount
      </label>
      <div className="relative">
        <Input
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          type="number"
          step="0.01"
          min="1"
          max="1000"
          className="input-cyber pr-12 text-lg font-bold"
          disabled={disabled}
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted font-terminal text-sm">
          USD
        </span>
      </div>

      {!disabled && (
        <div className="flex gap-2">
          <BetButton
            onAction={() =>
              onAmountChange(
                Math.max(GAME_CONSTANTS.MIN_BET, (parseFloat(amount) || 0) / 2).toFixed(2),
              )
            }
          >
            1/2
          </BetButton>
          <BetButton
            onAction={() =>
              onAmountChange(
                Math.min(GAME_CONSTANTS.MAX_BET, (parseFloat(amount) || 0) * 2).toFixed(2),
              )
            }
          >
            2x
          </BetButton>
          <BetButton
            onAction={() => onAmountChange(GAME_CONSTANTS.MAX_BET.toFixed(2))}
          >
            MAX
          </BetButton>
        </div>
      )}
    </div>
  );
}
