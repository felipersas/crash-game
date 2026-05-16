"use client";

import { useState, useEffect, useCallback } from "react";
import { Controller, type Control } from "react-hook-form";
import { Input } from "@/components/ui/Input";
import { RoundStatus } from "@/types";
import type { BetFormValues } from "@/schemas/bet-form.schema";

const STORAGE_KEY = "auto-cashout-last-multiplier";
const PRESETS = [1.5, 2, 5, 10] as const;

interface AutoCashOutProps {
  control: Control<BetFormValues>;
  disabled: boolean;
  roundStatus: RoundStatus;
}

export function AutoCashOut({ control, disabled, roundStatus }: AutoCashOutProps) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (roundStatus === RoundStatus.BETTING) {
      setEnabled(false);
    }
  }, [roundStatus]);

  return (
    <div className={`rounded-lg border transition-all ${
      enabled
        ? "border-primary/30 bg-primary/5 shadow-[0_0_12px_rgba(163,230,53,0.12)]"
        : "border-border"
    }`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setEnabled((v) => !v)}
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

      <Controller
        control={control}
        name="targetMultiplier"
        render={({ field: { onChange, value } }) => (
          <>{enabled && (
            <AutoCashOutInput
              value={value ?? null}
              onChange={onChange}
              disabled={disabled}
            />
          )}</>
        )}
      />
    </div>
  );
}

function AutoCashOutInput({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (val: number | undefined) => void;
  disabled: boolean;
}) {
  const [inputValue, setInputValue] = useState(
    value != null ? value.toFixed(2) : "",
  );

  useEffect(() => {
    if (value != null) {
      setInputValue(value.toFixed(2));
    }
  }, [value]);

  const loadSaved = useCallback(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 1.01 && parsed <= 1000) {
          setInputValue(parsed.toFixed(2));
          onChange(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, [onChange]);

  useEffect(() => {
    if (value == null) {
      loadSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) {
      setInputValue(raw);
      const num = parseFloat(raw);
      if (!isNaN(num) && num >= 1.01 && num <= 1000) {
        onChange(Math.round(num * 100) / 100);
        localStorage.setItem(STORAGE_KEY, num.toFixed(2));
      } else {
        onChange(undefined);
      }
    }
  };

  const handlePreset = (preset: number) => {
    setInputValue(preset.toFixed(2));
    onChange(preset);
    localStorage.setItem(STORAGE_KEY, preset.toFixed(2));
  };

  const handleBlur = () => {
    const num = parseFloat(inputValue);
    if (!isNaN(num) && num >= 1.01) {
      const rounded = Math.round(num * 100) / 100;
      setInputValue(rounded.toFixed(2));
    }
  };

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
          disabled={disabled}
          className="h-8 bg-background border-border text-primary text-sm font-bold text-center focus-visible:border-primary focus-visible:ring-primary/30"
        />
        <span className="text-text-muted text-sm font-terminal">×</span>
      </div>
      <div className="flex gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            onClick={() => handlePreset(preset)}
            className={`flex-1 py-1 rounded text-xs font-terminal transition-colors disabled:opacity-50 ${
              parseFloat(inputValue) === preset
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
