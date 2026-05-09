export class BetStatusResponseDto {
  betId!: string;
  roundId!: string;
  playerId!: string;
  amountCents!: number;
  amountDecimal!: string;
  status!: string;
  cashOutMultiplier!: number | null;
  payoutCents!: number | null;
  payoutDecimal!: string | null;
  cashedOutAt!: Date | null;
  cancelReason!: string | null;
}
