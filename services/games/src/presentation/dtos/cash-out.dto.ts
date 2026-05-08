import { IsString, IsOptional } from 'class-validator';

export class CashOutRequestDto {
  @IsString()
  @IsOptional()
  roundId?: string;
}

export class CashOutResponseDto {
  betId!: string;
  roundId!: string;
  playerId!: string;
  cashOutMultiplier!: number;
  payoutCents!: bigint;
  payoutDecimal!: string;
}
