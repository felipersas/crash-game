"use client";

import { Input } from "@/components/ui/input";

interface AutoCashoutInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}

export function AutoCashoutInput({ value, onChange, disabled }: AutoCashoutInputProps) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-terminal text-text-muted uppercase tracking-wider">
        Auto Cash Out
      </label>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type="number"
          step="0.01"
          min="1.01"
          max="1000"
          className="input-cyber pr-8"
          disabled={disabled}
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted font-terminal text-sm">
          x
        </span>
      </div>
    </div>
  );
}
