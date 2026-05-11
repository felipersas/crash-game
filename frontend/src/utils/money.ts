import { GAME_CONSTANTS } from "@/constants/game";

export function centsToDecimal(cents: number | bigint): string {
  const value = typeof cents === "bigint" ? Number(cents) : cents;
  return (value / 100).toFixed(2);
}

export function decimalToCents(decimal: string): number {
  return Math.round(parseFloat(decimal) * 100);
}

export function formatMoney(cents: number | bigint): string {
  const value = typeof cents === "bigint" ? Number(cents) : cents;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export function formatMultiplier(multiplier: number): string {
  return `${multiplier.toFixed(2)}x`;
}

export function calculatePayout(betCents: number, multiplier: number): number {
  return Math.floor(Math.round(betCents * multiplier * 100) / 100);
}

export function formatPayout(betCents: number, multiplier: number): string {
  const payout = calculatePayout(betCents, multiplier);
  return formatMoney(payout);
}

export function validateBetAmount(
  cents: number,
  balanceCents: number,
): { valid: boolean; error?: string } {
  if (cents < GAME_CONSTANTS.MIN_BET_CENTS) {
    return {
      valid: false,
      error: `Minimum bet is $${(GAME_CONSTANTS.MIN_BET_CENTS / 100).toFixed(2)}`,
    };
  }
  if (cents > GAME_CONSTANTS.MAX_BET_CENTS) {
    return {
      valid: false,
      error: `Maximum bet is $${(GAME_CONSTANTS.MAX_BET_CENTS / 100).toFixed(2)}`,
    };
  }
  if (cents > balanceCents) {
    return { valid: false, error: "Insufficient balance" };
  }
  return { valid: true };
}
