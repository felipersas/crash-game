export class BetOutputDto {
  id!: string;
  playerId!: string;
  amountCents!: number;
  amountDecimal!: string;
  status!: string;
  cashOutMultiplier!: number | null;
  cashOutAmountCents!: number | null;
  cashOutAmountDecimal!: string | null;
  cashedOutAt!: Date | null;
}

export class RoundOutputDto {
  roundId!: string;
  status!: string;
  crashPoint!: number | null;
  currentMultiplier!: number;
  bettingEndTime!: Date | null;
  startedAt!: Date | null;
  crashedAt!: Date | null;
  bets!: BetOutputDto[];
}

export class RoundSummaryOutputDto {
  roundId!: string;
  crashPoint!: number | null;
  status!: string;
  startedAt!: Date | null;
  crashedAt!: Date | null;
  totalBets!: number;
}

export class GetRoundHistoryResponseDto {
  rounds!: RoundSummaryOutputDto[];
  total!: number;
}

export class VerifyRoundResponseDto {
  roundId!: string;
  seed!: string;
  seedHash!: string;
  crashPoint!: number;
  verified!: boolean;
}
