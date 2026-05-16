"use client";

import { useCallback } from "react";
import { Controller, type Control } from "react-hook-form";
import { Input } from "@/components/ui/Input";
import { BetButton } from "./BetButton";
import { GAME_CONSTANTS } from "@/constants/game";
import { formatMoney } from "@/domain/money";
import type { BetFormValues } from "@/schemas/bet-form.schema";

interface BetInputProps {
  control: Control<BetFormValues>;
  disabled: boolean;
  error?: string;
}

export function BetInput({ control, disabled, error }: BetInputProps) {
  return (
    <Controller
      control={control}
      name="amountCents"
      render={({ field: { onChange, value } }) => {
        const displayValue = formatMoney(value);

        const handleChange = useCallback(
          (e: React.ChangeEvent<HTMLInputElement>) => {
            const rawDigits = e.target.value.replace(/\D/g, "");
            if (rawDigits === "") {
              onChange(0);
              return;
            }
            const centsValue = parseInt(rawDigits, 10);
            if (centsValue > GAME_CONSTANTS.MAX_BET_CENTS) return;
            onChange(centsValue);
          },
          [onChange],
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
                aria-invalid={!!error}
              />
            </div>

            {error && (
              <p className="text-xs text-destructive font-terminal">{error}</p>
            )}

            {!disabled && (
              <div className="flex gap-2">
                <BetButton
                  onAction={() =>
                    onChange(
                      Math.max(
                        GAME_CONSTANTS.MIN_BET_CENTS,
                        Math.round(value / 2),
                      ),
                    )
                  }
                >
                  1/2
                </BetButton>
                <BetButton
                  onAction={() =>
                    onChange(
                      Math.min(GAME_CONSTANTS.MAX_BET_CENTS, value * 2),
                    )
                  }
                >
                  2x
                </BetButton>
                <BetButton
                  onAction={() => onChange(GAME_CONSTANTS.MAX_BET_CENTS)}
                >
                  MAX
                </BetButton>
              </div>
            )}
          </div>
        );
      }}
    />
  );
}
