"use client";

import { useCallback } from "react";
import { Input } from "@/components/ui/Input";
import { BetButton } from "./BetButton";
import { GAME_CONSTANTS } from "@/constants/game";
import { formatMoney } from "@/domain/money";

interface BetInputProps {
  amount: string;
  onAmountChange: (value: string) => void;
  disabled: boolean;
}

export function BetInput({ amount, onAmountChange, disabled }: BetInputProps) {
  const cents = Math.round(parseFloat(amount || "0") * 100);
  const displayValue = formatMoney(cents);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawDigits = e.target.value.replace(/\D/g, "");
      if (rawDigits === "") {
        onAmountChange("0.00");
        return;
      }
      const centsValue = parseInt(rawDigits, 10);
      if (centsValue > GAME_CONSTANTS.MAX_BET_CENTS) return;
      onAmountChange((centsValue / 100).toFixed(2));
    },
    [onAmountChange],
  );

  return (
    <div className="space-y-2">
      <label className="text-xs font-terminal text-text-muted uppercase tracking-wider">
        Bet Amount
      </label>
      <div className="relative">
        <Input
          value={displayValue}
          onChange={handleChange}
          type="text"
          inputMode="numeric"
          className="h-10 bg-background border-border text-text-primary text-lg font-bold focus-visible:border-primary focus-visible:ring-primary/30"
          disabled={disabled}
        />
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
