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
