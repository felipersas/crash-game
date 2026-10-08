"use client";

import { useState } from "react";
import { useController, type Control } from "react-hook-form";
import { Input } from "@/components/ui/Input";
import { GAME_CONSTANTS } from "@/constants/game";
import type { BetFormValues } from "@/schemas/bet-form.schema";

const STORAGE_KEY = "auto-cashout-last-multiplier";
const PRESETS = [1.5, 2, 5, 10] as const;
const DEFAULT_TARGET = 2;

interface AutoCashOutProps {
  control: Control<BetFormValues>;
  disabled: boolean;
}

function isValidTarget(value: number): boolean {
  return (
    !Number.isNaN(value) &&
    value >= GAME_CONSTANTS.MIN_AUTO_CASHOUT &&
    value <= GAME_CONSTANTS.MAX_AUTO_CASHOUT
  );
}

function readSavedTarget(): number {
  try {
    const saved = Number.parseFloat(localStorage.getItem(STORAGE_KEY) ?? "");
    return isValidTarget(saved) ? saved : DEFAULT_TARGET;
  } catch {
    return DEFAULT_TARGET;
  }
}

function saveTarget(value: number) {
  try {
    localStorage.setItem(STORAGE_KEY, value.toFixed(2));
  } catch {
    // storage unavailable (private mode) — not critical
  }
}

/**
 * Auto cash-out toggle + target input.
 *
 * The toggle state is derived from the form value: `targetMultiplier`
 * undefined means OFF, so a hidden target is never submitted.
 */
export function AutoCashOut({ control, disabled }: AutoCashOutProps) {
  const { field, fieldState } = useController({ control, name: "targetMultiplier" });
  const enabled = field.value !== undefined;

  const toggle = () => {
    field.onChange(enabled ? undefined : readSavedTarget());
  };

  return (
    <div className={`rounded-lg border transition-all ${
      enabled
        ? "border-primary/30 bg-primary/5 shadow-[0_0_12px_rgba(163,230,53,0.12)]"
        : "border-border"
    }`}>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={disabled}
        onClick={toggle}
        className="w-full flex items-center justify-between px-3 py-2"
      >
        <span className={`text-sm font-terminal ${enabled ? "text-primary" : "text-text-muted"}`}>
          Auto Cashout
        </span>
        <div
          className={`w-9 h-5 rounded-full relative transition-colors ${
            enabled ? "bg-primary" : "bg-border"
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${
              enabled ? "right-0.5" : "left-0.5"
            }`}
          />
        </div>
      </button>

      {enabled && (
        <AutoCashOutInput
          initialValue={field.value}
          onChange={field.onChange}
          disabled={disabled}
          error={fieldState.error?.message}
        />
      )}
    </div>
  );
}

function AutoCashOutInput({
  initialValue,
  onChange,
  disabled,
  error,
}: {
  initialValue: number | undefined;
  onChange: (val: number) => void;
  disabled: boolean;
  error?: string;
}) {
  // Local text state so partially typed values ("1.", "") are preserved.
  // Mounted only while enabled, so it initializes from the form value.
  const [inputValue, setInputValue] = useState(
    initialValue !== undefined && !Number.isNaN(initialValue)
      ? initialValue.toFixed(2)
      : "",
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw !== "" && !/^\d*\.?\d{0,2}$/.test(raw)) return;
    setInputValue(raw);
    // Invalid / empty input becomes NaN so the schema blocks submission
    // instead of silently sending a stale target.
    const num = Number.parseFloat(raw);
    onChange(num);
    if (isValidTarget(num)) saveTarget(num);
  };

  const handlePreset = (preset: number) => {
    setInputValue(preset.toFixed(2));
    onChange(preset);
    saveTarget(preset);
  };

  const handleBlur = () => {
    const num = Number.parseFloat(inputValue);
    if (!Number.isNaN(num)) setInputValue(num.toFixed(2));
  };

  const current = Number.parseFloat(inputValue);

  return (
    <div className="px-3 pb-3 space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          type="text"
          inputMode="decimal"
          placeholder="Multiplier"
          aria-label="Auto cashout multiplier"
          aria-invalid={!!error}
          disabled={disabled}
          className="h-8 bg-background border-border text-primary text-sm font-bold text-center focus-visible:border-primary focus-visible:ring-primary/30"
        />
        <span className="text-text-muted text-sm font-terminal">×</span>
      </div>
      {error && (
        <p className="text-xs text-destructive font-terminal">{error}</p>
      )}
      <div className="flex gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            onClick={() => handlePreset(preset)}
            className={`flex-1 py-1 rounded text-xs font-terminal transition-colors disabled:opacity-50 ${
              current === preset
                ? "bg-primary/15 border border-primary text-primary"
                : "bg-secondary border border-border text-text-muted hover:border-primary/30 hover:text-primary"
            }`}
          >
            {preset}×
          </button>
        ))}
      </div>
    </div>
  );
}
